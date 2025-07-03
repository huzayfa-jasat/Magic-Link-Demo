const { Worker } = require('bullmq');
const knex = require('knex');
const config = require('../../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

const RateLimiter = require('../../services/rate-limiter');
const BouncerApiService = require('../../services/bouncer-api');
const { 
    redis, 
    JOB_TYPES, 
    PRIORITY, 
    emailVerificationQueue, 
    batchStatusQueue,
    defaultJobOptions 
} = require('../queue-config');

// Initialize services
const rateLimiter = new RateLimiter();
const bouncerApi = new BouncerApiService();

// Constants
const MAX_CONCURRENT_BATCHES = parseInt(process.env.MAX_CONCURRENT_BATCHES) || 15;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 10000;

class EmailVerificationProcessor {
    constructor() {
        this.worker = null;
        this.isRunning = false;
    }

    async start() {
        if (this.isRunning) {
            console.log('Email verification processor is already running');
            return;
        }

        console.log('Starting email verification processor...');
        
        this.worker = new Worker(
            'email-verification',
            async (job) => {
                const startTime = Date.now();
                console.log(`Processing job ${job.id} of type ${job.name}`);
                
                try {
                    let result;
                    
                    switch (job.name) {
                        case JOB_TYPES.CREATE_BATCH:
                            result = await this.processBatchCreation(job.data);
                            break;
                        case JOB_TYPES.RETRY_FAILED_BATCH:
                            result = await this.retryFailedBatch(job.data);
                            break;
                        default:
                            throw new Error(`Unknown job type: ${job.name}`);
                    }
                    
                    const processingTime = Date.now() - startTime;
                    console.log(`Job ${job.id} completed in ${processingTime}ms`);
                    
                    return result;
                } catch (error) {
                    console.error(`Job ${job.id} failed:`, error);
                    throw error;
                }
            },
            {
                connection: redis,
                concurrency: 5, // Process up to 5 jobs simultaneously
                limiter: {
                    max: 10,     // Max 10 jobs per duration
                    duration: 60000 // 1 minute
                }
            }
        );

        // Event listeners for monitoring
        this.worker.on('completed', (job) => {
            console.log(`Job ${job.id} completed successfully`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`Job ${job.id} failed:`, err);
        });

        this.worker.on('error', (err) => {
            console.error('Worker error:', err);
        });

        this.isRunning = true;
        console.log('Email verification processor started successfully');
    }

    async stop() {
        if (!this.isRunning) {
            console.log('Email verification processor is not running');
            return;
        }

        console.log('Stopping email verification processor...');
        
        if (this.worker) {
            await this.worker.close();
        }
        
        this.isRunning = false;
        console.log('Email verification processor stopped');
    }

    async processBatchCreation(jobData) {
        const { emails, userId, requestId } = jobData;
        
        console.log(`Processing batch creation for ${emails.length} emails (user: ${userId}, request: ${requestId})`);
        
        try {
            // Check concurrent batch limit
            const activeBatches = await this.getActiveBatchCount();
            if (activeBatches >= MAX_CONCURRENT_BATCHES) {
                console.log(`Max concurrent batches reached (${activeBatches}/${MAX_CONCURRENT_BATCHES}), deferring batch creation`);
                
                // Re-queue with delay
                await emailVerificationQueue.add(
                    JOB_TYPES.CREATE_BATCH,
                    { emails, userId, requestId },
                    { 
                        ...defaultJobOptions,
                        delay: 60000, // Retry in 1 minute
                        priority: PRIORITY.NORMAL 
                    }
                );
                
                return { 
                    status: 'deferred', 
                    reason: 'max_batches_reached',
                    activeBatches: activeBatches
                };
            }
            
            // Check rate limit
            if (!(await rateLimiter.canMakeApiCall())) {
                const nextAvailable = await rateLimiter.getNextAvailableTime();
                const delay = nextAvailable.getTime() - Date.now();
                
                console.log(`Rate limit hit, deferring batch creation for ${delay}ms`);
                
                // Re-queue with appropriate delay
                await emailVerificationQueue.add(
                    JOB_TYPES.CREATE_BATCH,
                    { emails, userId, requestId },
                    { 
                        ...defaultJobOptions,
                        delay: Math.max(delay, 0),
                        priority: PRIORITY.NORMAL 
                    }
                );
                
                return { 
                    status: 'deferred', 
                    reason: 'rate_limit',
                    nextAvailable: nextAvailable.toISOString()
                };
            }
            
            // Create optimized batch
            const optimizedEmails = await this.optimizeBatchComposition(emails);
            
            // Record the API call
            await rateLimiter.recordApiCall();
            
            // Create batch via Bouncer API
            const batch = await bouncerApi.createBatch(optimizedEmails, userId, requestId);
            
            console.log(`Batch created successfully: ${batch.batch_id} with ${batch.quantity} emails`);
            
            // Schedule status check
            await batchStatusQueue.add(
                JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId: batch.id },
                { 
                    ...defaultJobOptions,
                    delay: 30000, // Check in 30 seconds
                    priority: PRIORITY.HIGH 
                }
            );
            
            return { 
                status: 'created', 
                batchId: batch.id,
                bouncerBatchId: batch.batch_id,
                quantity: batch.quantity,
                duplicates: batch.duplicates
            };
            
        } catch (error) {
            console.error('Error in batch creation:', error);
            
            // Handle specific error types
            if (error.message.includes('402')) {
                // Payment required - move to dead letter queue
                await this.moveToDeadLetterQueue(userId, requestId, error.message);
                throw new Error('Payment required for batch processing');
            }
            
            if (error.message.includes('429')) {
                // Rate limit hit - should be handled by rate limiter, but just in case
                await emailVerificationQueue.add(
                    JOB_TYPES.CREATE_BATCH,
                    { emails, userId, requestId },
                    { 
                        ...defaultJobOptions,
                        delay: 60000,
                        priority: PRIORITY.NORMAL 
                    }
                );
                
                return { 
                    status: 'deferred', 
                    reason: 'api_rate_limit',
                    error: error.message
                };
            }
            
            // For other errors, let the retry mechanism handle it
            throw error;
        }
    }

    async retryFailedBatch(jobData) {
        const { batchId, userId, requestId, originalEmails } = jobData;
        
        console.log(`Retrying failed batch ${batchId}`);
        
        try {
            // Get batch info
            const batch = await db('Bouncer_Batches').where('id', batchId).first();
            if (!batch) {
                throw new Error(`Batch ${batchId} not found`);
            }
            
            // Check if batch can be retried
            if (batch.retry_count >= 3) {
                console.log(`Batch ${batchId} has reached max retries, moving to dead letter queue`);
                await this.moveToDeadLetterQueue(userId, requestId, 'Max retries reached');
                return { status: 'failed', reason: 'max_retries_reached' };
            }
            
            // Increment retry count
            await db('Bouncer_Batches')
                .where('id', batchId)
                .update({ 
                    retry_count: batch.retry_count + 1,
                    updated_ts: new Date()
                });
            
            // Get original emails if not provided
            let emails = originalEmails;
            if (!emails) {
                emails = await this.getEmailsForBatch(batchId);
            }
            
            // Process as new batch creation
            return await this.processBatchCreation({ emails, userId, requestId });
            
        } catch (error) {
            console.error('Error in retry failed batch:', error);
            throw error;
        }
    }

    async getActiveBatchCount() {
        const result = await db('Bouncer_Batches')
            .count('* as count')
            .whereIn('status', ['queued', 'processing', 'downloading'])
            .first();
        
        return parseInt(result.count) || 0;
    }

    async optimizeBatchComposition(emails) {
        console.log(`Optimizing batch composition for ${emails.length} emails`);
        
        // Group by domain for optimization
        const domainGroups = {};
        
        emails.forEach(email => {
            const emailAddress = email.email || email;
            const domain = emailAddress.split('@')[1];
            
            if (!domainGroups[domain]) {
                domainGroups[domain] = [];
            }
            
            domainGroups[domain].push(email);
        });
        
        // Interleave emails from different domains for better processing
        const optimizedBatch = [];
        const domains = Object.keys(domainGroups);
        
        // Continue until all emails are processed
        while (optimizedBatch.length < emails.length) {
            for (const domain of domains) {
                if (domainGroups[domain].length > 0) {
                    optimizedBatch.push(domainGroups[domain].shift());
                }
            }
        }
        
        console.log(`Optimized batch composition: ${domains.length} domains interleaved`);
        
        return optimizedBatch;
    }

    async getEmailsForBatch(batchId) {
        const queueItems = await db('Bouncer_Queue')
            .join('Contacts_Global', 'Bouncer_Queue.global_id', 'Contacts_Global.global_id')
            .where('Bouncer_Queue.batch_id', batchId)
            .select('Contacts_Global.email');
        
        return queueItems.map(item => ({ email: item.email }));
    }

    async moveToDeadLetterQueue(userId, requestId, errorMessage) {
        console.log(`Moving batch to dead letter queue: ${errorMessage}`);
        
        await db('Bouncer_Dead_Letter_Queue').insert({
            batch_id: 0, // No batch ID for failed creation
            user_id: userId,
            request_id: requestId,
            error_message: errorMessage
        });
    }
}

// Export the processor class and create a singleton instance
const emailVerificationProcessor = new EmailVerificationProcessor();

module.exports = {
    EmailVerificationProcessor,
    emailVerificationProcessor
};