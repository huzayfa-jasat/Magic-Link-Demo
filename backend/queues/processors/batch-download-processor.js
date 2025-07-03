const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const knex = require('knex');
const fetch = require('node-fetch');

// Database configuration
const config = require('../../knexfile.js');
const db = knex(config.development);

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 3
});

// Job types
const JOB_TYPES = {
    DOWNLOAD_BATCH_RESULTS: 'download-batch-results'
};

// Priority levels
const PRIORITY = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25
};

// Rate limiter class
class RateLimiter {
    constructor() {
        this.windowSizeMs = 60000; // 1 minute window
        this.maxRequests = 180; // Conservative limit (20 buffer from 200)
    }
    
    async canMakeApiCall() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowSizeMs);
        
        try {
            // Count requests in current window
            const result = await db('Bouncer_Rate_Limit')
                .where('window_start_ts', '>=', windowStart)
                .count('* as count');
            
            return result[0].count < this.maxRequests;
        } catch (error) {
            console.error('Rate limiter check failed:', error);
            return false; // Fail safe
        }
    }
    
    async recordApiCall() {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + this.windowSizeMs);
        
        try {
            await db('Bouncer_Rate_Limit').insert({
                request_count: 1,
                window_start_ts: now,
                window_end_ts: windowEnd
            });
        } catch (error) {
            console.error('Failed to record API call:', error);
        }
    }
    
    async getNextAvailableTime() {
        try {
            const result = await db('Bouncer_Rate_Limit')
                .select('window_start_ts')
                .orderBy('window_start_ts', 'asc')
                .limit(1)
                .offset(this.maxRequests - 1);
            
            if (result.length === 0) {
                return new Date(); // Can make request now
            }
            
            return new Date(result[0].window_start_ts.getTime() + this.windowSizeMs);
        } catch (error) {
            console.error('Failed to get next available time:', error);
            return new Date(Date.now() + this.windowSizeMs); // Default to 1 minute delay
        }
    }
}

// Initialize rate limiter
const rateLimiter = new RateLimiter();

// Error handler class
class ErrorHandler {
    static classifyError(error) {
        if (error.status === 429) return 'RATE_LIMIT';
        if (error.status === 402) return 'PAYMENT_REQUIRED';
        if (error.status >= 500) return 'API_ERROR';
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return 'NETWORK_ERROR';
        if (error.status === 400) return 'PERMANENT_FAILURE';
        
        return 'GENERIC_ERROR';
    }
    
    static shouldRetry(error) {
        const errorType = this.classifyError(error);
        return ['RATE_LIMIT', 'API_ERROR', 'NETWORK_ERROR'].includes(errorType);
    }
    
    static getRetryDelay(error) {
        const errorType = this.classifyError(error);
        
        switch (errorType) {
            case 'RATE_LIMIT':
                return 60000; // 1 minute
            case 'API_ERROR':
                return 30000; // 30 seconds
            case 'NETWORK_ERROR':
                return 15000; // 15 seconds
            default:
                return 5000; // 5 seconds
        }
    }
}

// Bouncer API client
class BouncerApiClient {
    constructor() {
        this.baseUrl = process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1';
        this.apiKey = process.env.BOUNCER_API_KEY;
        
        if (!this.apiKey) {
            throw new Error('BOUNCER_API_KEY environment variable is required');
        }
    }
    
    async downloadBatchResults(batchId) {
        const url = `${this.baseUrl}/email/verification/batch-download`;
        const headers = {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };
        
        const requestBody = {
            batch_id: batchId
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const error = new Error(`Bouncer API error: ${response.status} ${response.statusText}`);
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        return data;
    }
}

// Initialize API client
const bouncerClient = new BouncerApiClient();

// Database helper functions
async function getBatchInfo(batchId) {
    try {
        const result = await db('Bouncer_Batches')
            .select('*')
            .where('id', batchId)
            .first();
        
        return result;
    } catch (error) {
        console.error('Failed to get batch info:', error);
        throw error;
    }
}

async function updateContactResult(trx, result) {
    try {
        const updateData = {
            status: result.status,
            result: result.result,
            reason: result.reason,
            updated_ts: new Date()
        };
        
        await trx('Contacts_Global')
            .where('global_id', result.global_id)
            .update(updateData);
    } catch (error) {
        console.error('Failed to update contact result:', error);
        throw error;
    }
}

async function storeDetailedResults(trx, batchId, results) {
    try {
        const detailedResults = results.map(result => ({
            batch_id: batchId,
            global_id: result.global_id,
            bouncer_status: result.status,
            bouncer_reason: result.reason,
            domain_info: result.domain_info ? JSON.stringify(result.domain_info) : null,
            account_info: result.account_info ? JSON.stringify(result.account_info) : null,
            dns_info: result.dns_info ? JSON.stringify(result.dns_info) : null,
            provider: result.provider,
            score: result.score,
            toxic: result.toxic,
            toxicity: result.toxicity,
            processed_ts: new Date()
        }));
        
        // Use batch insert for better performance
        await trx('Bouncer_Results').insert(detailedResults);
    } catch (error) {
        console.error('Failed to store detailed results:', error);
        throw error;
    }
}

async function updateBatchStatus(trx, batchId, status, errorMessage = null) {
    try {
        const updateData = {
            status: status,
            updated_ts: new Date()
        };
        
        if (status === 'completed') {
            updateData.completed_ts = new Date();
        }
        
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }
        
        await trx('Bouncer_Batches')
            .where('id', batchId)
            .update(updateData);
    } catch (error) {
        console.error('Failed to update batch status:', error);
        throw error;
    }
}

async function updateQueueItems(trx, batchId, status) {
    try {
        const updateData = {
            status: status,
            updated_ts: new Date()
        };
        
        if (status === 'completed') {
            updateData.completed_ts = new Date();
        }
        
        await trx('Bouncer_Queue')
            .where('batch_id', batchId)
            .update(updateData);
    } catch (error) {
        console.error('Failed to update queue items:', error);
        throw error;
    }
}

async function incrementBatchRetryCount(batchId) {
    try {
        await db('Bouncer_Batches')
            .where('id', batchId)
            .increment('retry_count', 1);
    } catch (error) {
        console.error('Failed to increment batch retry count:', error);
        throw error;
    }
}

async function addToDeadLetterQueue(batch, errorMessage) {
    try {
        await db('Bouncer_Dead_Letter_Queue').insert({
            batch_id: batch.id,
            user_id: batch.user_id,
            request_id: batch.request_id,
            error_message: errorMessage,
            failed_ts: new Date()
        });
    } catch (error) {
        console.error('Failed to add to dead letter queue:', error);
    }
}

// Main batch download processor function
async function downloadBatchResults(batchId) {
    console.log(`Starting batch download for batch ID: ${batchId}`);
    
    try {
        // Get batch information
        const batch = await getBatchInfo(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }
        
        // Check if batch is in correct state
        if (batch.status !== 'processing' && batch.status !== 'downloading') {
            console.log(`Batch ${batchId} is not ready for download. Status: ${batch.status}`);
            return { status: 'skipped', reason: 'batch_not_ready' };
        }
        
        // Check rate limit
        if (!(await rateLimiter.canMakeApiCall())) {
            console.log(`Rate limit exceeded for batch ${batchId}, rescheduling`);
            const nextAvailable = await rateLimiter.getNextAvailableTime();
            const delay = Math.max(nextAvailable.getTime() - Date.now(), 0);
            
            // Return information for re-queueing
            return { 
                status: 'deferred', 
                reason: 'rate_limit',
                delay: delay
            };
        }
        
        // Update batch status to downloading
        await updateBatchStatus(db, batch.id, 'downloading');
        
        // Record API call before making request
        await rateLimiter.recordApiCall();
        
        // Download results from Bouncer API
        console.log(`Downloading results for Bouncer batch ID: ${batch.batch_id}`);
        const apiResults = await bouncerClient.downloadBatchResults(batch.batch_id);
        
        if (!apiResults || !apiResults.results || !Array.isArray(apiResults.results)) {
            throw new Error('Invalid API response format');
        }
        
        const results = apiResults.results;
        console.log(`Downloaded ${results.length} results for batch ${batchId}`);
        
        // Process results in database transaction
        await db.transaction(async (trx) => {
            // Update Contacts_Global with latest results
            for (const result of results) {
                await updateContactResult(trx, result);
            }
            
            // Store detailed results
            await storeDetailedResults(trx, batch.id, results);
            
            // Update batch status to completed
            await updateBatchStatus(trx, batch.id, 'completed');
            
            // Update queue items status
            await updateQueueItems(trx, batch.id, 'completed');
            
            console.log(`Successfully processed batch ${batchId} with ${results.length} results`);
        });
        
        return { 
            status: 'downloaded', 
            results_count: results.length,
            batch_id: batch.id
        };
        
    } catch (error) {
        console.error(`Error downloading batch ${batchId}:`, error);
        
        const errorType = ErrorHandler.classifyError(error);
        const shouldRetry = ErrorHandler.shouldRetry(error);
        
        // Get current retry count
        const batch = await getBatchInfo(batchId);
        const currentRetryCount = batch ? batch.retry_count : 0;
        const maxRetries = 3;
        
        if (shouldRetry && currentRetryCount < maxRetries) {
            // Increment retry count
            await incrementBatchRetryCount(batchId);
            
            // Update batch status to failed for retry
            await updateBatchStatus(db, batchId, 'failed', error.message);
            
            const retryDelay = ErrorHandler.getRetryDelay(error);
            console.log(`Scheduling retry for batch ${batchId} in ${retryDelay}ms (attempt ${currentRetryCount + 1}/${maxRetries})`);
            
            return {
                status: 'retry',
                reason: errorType,
                delay: retryDelay,
                retry_count: currentRetryCount + 1
            };
        } else {
            // Max retries reached or permanent failure
            console.error(`Batch ${batchId} failed permanently after ${currentRetryCount} retries`);
            
            // Update batch status to failed
            await updateBatchStatus(db, batchId, 'failed', error.message);
            
            // Add to dead letter queue
            if (batch) {
                await addToDeadLetterQueue(batch, error.message);
            }
            
            return {
                status: 'failed',
                reason: errorType,
                error: error.message,
                retry_count: currentRetryCount
            };
        }
    }
}

// Create and configure the batch download worker
const batchDownloadWorker = new Worker(
    'batch-download',
    async (job) => {
        const { batchId } = job.data;
        
        if (job.name === JOB_TYPES.DOWNLOAD_BATCH_RESULTS) {
            return await downloadBatchResults(batchId);
        } else {
            throw new Error(`Unknown job type: ${job.name}`);
        }
    },
    {
        connection: redis,
        concurrency: 3, // Limited concurrency for downloads as specified
        limiter: {
            max: 20,     // Max 20 downloads per minute
            duration: 60000
        },
        removeOnComplete: 50,
        removeOnFail: 100
    }
);

// Worker event handlers
batchDownloadWorker.on('completed', (job, result) => {
    console.log(`Batch download job ${job.id} completed:`, result);
});

batchDownloadWorker.on('failed', (job, err) => {
    console.error(`Batch download job ${job.id} failed:`, err);
});

batchDownloadWorker.on('error', (err) => {
    console.error('Batch download worker error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down batch download worker gracefully...');
    
    try {
        await batchDownloadWorker.close();
        await redis.quit();
        console.log('Batch download worker shutdown complete');
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
    
    process.exit(0);
});

module.exports = {
    batchDownloadWorker,
    downloadBatchResults,
    JOB_TYPES,
    PRIORITY
};