// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');
const { getKnexInstance } = require('../../config/bouncer-config.js');

// Services
const { 
    emailVerificationQueue, 
    batchStatusQueue, 
    batchDownloadQueue, 
    cleanupQueue, 
    JOB_TYPES, 
    PRIORITY,
    defaultJobOptions 
} = require('../../queues/queue-config.js');

const BouncerApiService = require('../../services/bouncer-api.js');
const RateLimiter = require('../../services/rate-limiter.js');

// Initialize services and database
const db = getKnexInstance();
const bouncerApi = new BouncerApiService();
const rateLimiter = new RateLimiter();

// Constants
const MAX_EMAILS_PER_BATCH = 10000;
const MIN_EMAILS_PER_BATCH = 1;
const MAX_BATCH_SIZE_LIMIT = 50000;

// Input validation helpers
const validateEmailArray = (emails) => {
    if (!Array.isArray(emails)) {
        return { valid: false, error: 'Emails must be an array' };
    }
    
    if (emails.length < MIN_EMAILS_PER_BATCH) {
        return { valid: false, error: `Minimum ${MIN_EMAILS_PER_BATCH} email required` };
    }
    
    if (emails.length > MAX_BATCH_SIZE_LIMIT) {
        return { valid: false, error: `Maximum ${MAX_BATCH_SIZE_LIMIT} emails allowed per request` };
    }
    
    // Validate email format and structure
    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        
        // Accept both string emails and email objects
        const emailAddress = typeof email === 'string' ? email : email.email;
        
        if (!emailAddress || typeof emailAddress !== 'string') {
            return { valid: false, error: `Invalid email format at index ${i}` };
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress)) {
            return { valid: false, error: `Invalid email format: ${emailAddress}` };
        }
    }
    
    return { valid: true };
};

const sanitizeEmails = (emails) => {
    return emails.map(email => {
        if (typeof email === 'string') {
            return { email: email.trim().toLowerCase() };
        } else {
            return {
                email: email.email.trim().toLowerCase(),
                name: email.name ? email.name.trim() : ''
            };
        }
    });
};

// Helper function to get queue statistics
const getQueueStatistics = async () => {
    const queues = {
        'email-verification': emailVerificationQueue,
        'batch-status-check': batchStatusQueue,
        'batch-download': batchDownloadQueue,
        'cleanup-tasks': cleanupQueue
    };
    
    const stats = {};
    
    for (const [name, queue] of Object.entries(queues)) {
        try {
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            stats[name] = {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length
            };
        } catch (error) {
            console.error(`Error getting stats for queue ${name}:`, error);
            stats[name] = {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                error: error.message
            };
        }
    }
    
    return stats;
};

/**
 * Verify emails controller
 */
async function verifyEmails(req, res) {
    const startTime = Date.now();
    
    try {
        console.log(`[${req.user.id}] Verify emails request received`);
        
        // Validate request body
        const { emails, priority = 'normal', options = {} } = req.body;
        
        // Validate emails array
        const emailValidation = validateEmailArray(emails);
        if (!emailValidation.valid) {
            console.log(`[${req.user.id}] Email validation failed: ${emailValidation.error}`);
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: emailValidation.error,
                code: 'INVALID_EMAIL_FORMAT'
            });
        }
        
        // Validate priority
        const validPriorities = ['low', 'normal', 'high', 'critical'];
        if (!validPriorities.includes(priority)) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid priority level',
                code: 'INVALID_PRIORITY'
            });
        }
        
        // Sanitize emails
        const sanitizedEmails = sanitizeEmails(emails);
        
        // Check rate limit for user
        const canProceed = await rateLimiter.canMakeApiCall();
        if (!canProceed) {
            const nextAvailable = await rateLimiter.getNextAvailableTime();
            return res.status(HttpStatus.TOO_MANY_REQUESTS_STATUS || 429).json({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                nextAvailable: nextAvailable.toISOString(),
                retryAfter: Math.ceil((nextAvailable.getTime() - Date.now()) / 1000)
            });
        }
        
        // Create verification request record
        const requestId = await db.transaction(async (trx) => {
            // Create main request record
            const requestRecord = await trx('Requests').insert({
                user_id: req.user.id,
                type: 'bouncer_verification',
                status: 'queued',
                total_emails: sanitizedEmails.length,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            const newRequestId = requestRecord[0];
            
            // Add emails to queue table for processing
            const queueItems = sanitizedEmails.map(email => ({
                global_id: null, // Will be populated when processed
                user_id: req.user.id,
                request_id: newRequestId,
                status: 'queued',
                priority: PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL,
                domain_hash: email.email.split('@')[1],
                created_ts: new Date()
            }));
            
            await trx('Bouncer_Queue').insert(queueItems);
            
            return newRequestId;
        });
        
        // Map priority to queue priority
        const queuePriority = PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL;
        
        // Add job to email verification queue
        const jobData = {
            emails: sanitizedEmails,
            userId: req.user.id,
            requestId: requestId,
            options: {
                skipDuplicates: options.skipDuplicates || false,
                optimizeBatch: options.optimizeBatch !== false, // Default to true
                timestamp: Date.now()
            }
        };
        
        const jobOptions = {
            ...defaultJobOptions,
            priority: queuePriority,
            removeOnComplete: 100,
            removeOnFail: 50
        };
        
        const job = await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            jobData,
            jobOptions
        );
        
        const processingTime = Date.now() - startTime;
        console.log(`[${req.user.id}] Verify emails request processed in ${processingTime}ms`);
        
        // Return response
        return res.status(HttpStatus.SUCCESS_STATUS).json({
            data: {
                requestId: requestId,
                jobId: job.id,
                status: 'queued',
                emailCount: sanitizedEmails.length,
                priority: priority,
                estimatedProcessingTime: '5-10 minutes',
                createdAt: new Date().toISOString()
            },
            processingTime: processingTime
        });
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Verify emails error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get verification status controller
 */
async function getStatus(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId } = req.params;
        const { detailed = false } = req.query;
        
        console.log(`[${req.user.id}] Status request for ${requestId}`);
        
        // Validate request ID
        if (!requestId || isNaN(parseInt(requestId))) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid request ID',
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        // Get request information
        const request = await db('Requests')
            .where('id', requestId)
            .where('user_id', req.user.id)
            .first();
        
        if (!request) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'Request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Get batch information
        const batches = await db('Bouncer_Batches')
            .where('request_id', requestId)
            .orderBy('created_ts', 'desc');
        
        // Get queue statistics
        const queueStats = await db('Bouncer_Queue')
            .where('request_id', requestId)
            .select('status')
            .count('* as count')
            .groupBy('status');
        
        const queueCounts = queueStats.reduce((acc, stat) => {
            acc[stat.status] = parseInt(stat.count);
            return acc;
        }, {});
        
        // Calculate overall progress
        const totalEmails = request.total_emails || 0;
        const processedEmails = (queueCounts.completed || 0) + (queueCounts.failed || 0);
        const progressPercentage = totalEmails > 0 ? Math.round((processedEmails / totalEmails) * 100) : 0;
        
        // Determine overall status
        let overallStatus = 'queued';
        if (processedEmails === totalEmails && totalEmails > 0) {
            overallStatus = 'completed';
        } else if (queueCounts.assigned > 0 || batches.some(b => b.status === 'processing')) {
            overallStatus = 'processing';
        } else if (batches.some(b => b.status === 'failed')) {
            overallStatus = 'failed';
        }
        
        const response = {
            data: {
                requestId: parseInt(requestId),
                status: overallStatus,
                progress: {
                    totalEmails: totalEmails,
                    processedEmails: processedEmails,
                    queuedEmails: queueCounts.queued || 0,
                    assignedEmails: queueCounts.assigned || 0,
                    completedEmails: queueCounts.completed || 0,
                    failedEmails: queueCounts.failed || 0,
                    progressPercentage: progressPercentage
                },
                batchCount: batches.length,
                createdAt: request.created_at,
                updatedAt: request.updated_at
            }
        };
        
        // Add detailed batch information if requested
        if (detailed === 'true' && batches.length > 0) {
            response.data.batches = batches.map(batch => ({
                id: batch.id,
                batchId: batch.batch_id,
                status: batch.status,
                quantity: batch.quantity,
                duplicates: batch.duplicates,
                createdAt: batch.created_ts,
                updatedAt: batch.updated_ts,
                completedAt: batch.completed_ts,
                retryCount: batch.retry_count,
                errorMessage: batch.error_message
            }));
        }
        
        const processingTime = Date.now() - startTime;
        response.processingTime = processingTime;
        
        console.log(`[${req.user.id}] Status request completed in ${processingTime}ms`);
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Status error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get verification results controller
 */
async function getResults(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId } = req.params;
        const { 
            page = 1, 
            limit = 500, 
            filter = 'all',
            format = 'json'
        } = req.query;
        
        console.log(`[${req.user.id}] Results request for ${requestId}`);
        
        // Validate request ID
        if (!requestId || isNaN(parseInt(requestId))) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid request ID',
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        // Validate pagination parameters
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid page number',
                code: 'INVALID_PAGE'
            });
        }
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid limit (must be between 1 and 1000)',
                code: 'INVALID_LIMIT'
            });
        }
        
        // Validate filter
        const validFilters = ['all', 'deliverable', 'undeliverable', 'risky', 'unknown'];
        if (!validFilters.includes(filter)) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid filter',
                code: 'INVALID_FILTER'
            });
        }
        
        // Check if request exists and belongs to user
        const request = await db('Requests')
            .where('id', requestId)
            .where('user_id', req.user.id)
            .first();
        
        if (!request) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'Request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Get batch IDs for this request
        const batches = await db('Bouncer_Batches')
            .where('request_id', requestId)
            .select('id');
        
        const batchIds = batches.map(b => b.id);
        
        if (batchIds.length === 0) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'No batches found for this request',
                code: 'NO_BATCHES_FOUND'
            });
        }
        
        // Build query for results
        let query = db('Bouncer_Results')
            .join('Contacts_Global', 'Bouncer_Results.global_id', 'Contacts_Global.global_id')
            .whereIn('Bouncer_Results.batch_id', batchIds);
        
        // Apply filter
        if (filter !== 'all') {
            switch (filter) {
                case 'deliverable':
                    query = query.where('bouncer_status', 'deliverable');
                    break;
                case 'undeliverable':
                    query = query.where('bouncer_status', 'undeliverable');
                    break;
                case 'risky':
                    query = query.whereIn('bouncer_status', ['risky', 'unknown']);
                    break;
                case 'unknown':
                    query = query.where('bouncer_status', 'unknown');
                    break;
            }
        }
        
        // Get total count
        const totalCount = await query.clone().count('* as count').first();
        const total = parseInt(totalCount.count);
        
        // Get paginated results
        const results = await query
            .select([
                'Contacts_Global.email',
                'Contacts_Global.name',
                'Bouncer_Results.bouncer_status',
                'Bouncer_Results.bouncer_reason',
                'Bouncer_Results.provider',
                'Bouncer_Results.score',
                'Bouncer_Results.toxic',
                'Bouncer_Results.toxicity',
                'Bouncer_Results.domain_info',
                'Bouncer_Results.account_info',
                'Bouncer_Results.dns_info',
                'Bouncer_Results.processed_ts'
            ])
            .orderBy('Bouncer_Results.processed_ts', 'desc')
            .limit(limitNum)
            .offset((pageNum - 1) * limitNum);
        
        // Calculate pagination info
        const totalPages = Math.ceil(total / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;
        
        const response = {
            data: {
                requestId: parseInt(requestId),
                results: results.map(result => ({
                    email: result.email,
                    name: result.name,
                    status: result.bouncer_status,
                    reason: result.bouncer_reason,
                    provider: result.provider,
                    score: result.score,
                    toxic: result.toxic,
                    toxicity: result.toxicity,
                    domainInfo: result.domain_info,
                    accountInfo: result.account_info,
                    dnsInfo: result.dns_info,
                    processedAt: result.processed_ts
                })),
                pagination: {
                    currentPage: pageNum,
                    totalPages: totalPages,
                    totalResults: total,
                    resultsPerPage: limitNum,
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage
                },
                filter: filter
            }
        };
        
        const processingTime = Date.now() - startTime;
        response.processingTime = processingTime;
        
        console.log(`[${req.user.id}] Results request completed in ${processingTime}ms`);
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Results error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get queue statistics controller
 */
async function getQueueStats(req, res) {
    const startTime = Date.now();
    
    try {
        const { detailed = false } = req.query;
        
        console.log(`[${req.user.id}] Queue stats request`);
        
        // Get queue statistics
        const queueStats = await getQueueStatistics();
        
        // Get rate limit status
        const rateLimitStatus = await rateLimiter.getRateLimitStatus();
        
        // Get active batch count
        const activeBatches = await db('Bouncer_Batches')
            .count('* as count')
            .whereIn('status', ['queued', 'processing', 'downloading'])
            .first();
        
        // Get user-specific queue stats
        const userQueueStats = await db('Bouncer_Queue')
            .where('user_id', req.user.id)
            .select('status')
            .count('* as count')
            .groupBy('status');
        
        const userQueueCounts = userQueueStats.reduce((acc, stat) => {
            acc[stat.status] = parseInt(stat.count);
            return acc;
        }, {});
        
        // Calculate system capacity
        const maxConcurrentBatches = parseInt(process.env.MAX_CONCURRENT_BATCHES) || 15;
        const remainingCapacity = maxConcurrentBatches - parseInt(activeBatches.count);
        
        const response = {
            data: {
                systemHealth: {
                    status: remainingCapacity > 0 ? 'healthy' : 'at_capacity',
                    activeBatches: parseInt(activeBatches.count),
                    maxConcurrentBatches: maxConcurrentBatches,
                    remainingCapacity: Math.max(0, remainingCapacity),
                    capacityUtilization: Math.round((parseInt(activeBatches.count) / maxConcurrentBatches) * 100)
                },
                rateLimiting: {
                    status: rateLimitStatus.canMakeCall ? 'available' : 'limited',
                    requestsRemaining: rateLimitStatus.requestsRemaining,
                    windowResetTime: rateLimitStatus.windowResetTime,
                    utilizationPercentage: rateLimitStatus.utilizationPercentage
                },
                userQueues: {
                    queued: userQueueCounts.queued || 0,
                    assigned: userQueueCounts.assigned || 0,
                    completed: userQueueCounts.completed || 0,
                    failed: userQueueCounts.failed || 0,
                    total: Object.values(userQueueCounts).reduce((sum, count) => sum + count, 0)
                },
                globalQueues: queueStats
            }
        };
        
        // Add detailed information if requested
        if (detailed === 'true') {
            // Get recent batch performance
            const recentBatches = await db('Bouncer_Batches')
                .where('completed_ts', '>', new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
                .where('status', 'completed')
                .select([
                    'quantity',
                    'created_ts',
                    'completed_ts',
                    db.raw('TIMESTAMPDIFF(MINUTE, created_ts, completed_ts) as processing_minutes')
                ])
                .orderBy('completed_ts', 'desc')
                .limit(100);
            
            if (recentBatches.length > 0) {
                const avgProcessingTime = recentBatches.reduce((sum, batch) => 
                    sum + (batch.processing_minutes || 0), 0) / recentBatches.length;
                
                const totalEmailsProcessed = recentBatches.reduce((sum, batch) => 
                    sum + (batch.quantity || 0), 0);
                
                response.data.performance = {
                    last24Hours: {
                        batchesCompleted: recentBatches.length,
                        emailsProcessed: totalEmailsProcessed,
                        averageProcessingTimeMinutes: Math.round(avgProcessingTime),
                        throughputEmailsPerHour: Math.round(totalEmailsProcessed / 24)
                    }
                };
            }
            
            // Get error statistics
            const errorStats = await db('Bouncer_Dead_Letter_Queue')
                .where('failed_ts', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
                .count('* as count')
                .first();
            
            response.data.errorStats = {
                deadLetterQueueCount: parseInt(errorStats.count),
                last24Hours: parseInt(errorStats.count)
            };
        }
        
        const processingTime = Date.now() - startTime;
        response.processingTime = processingTime;
        
        console.log(`[${req.user.id}] Queue stats request completed in ${processingTime}ms`);
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Queue stats error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Retry failed verifications controller
 */
async function retryFailed(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId, batchId, emails, priority = 'normal' } = req.body;
        
        console.log(`[${req.user.id}] Retry failed request`);
        
        // Validate input - at least one parameter must be provided
        if (!requestId && !batchId && !emails) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Must provide requestId, batchId, or emails to retry',
                code: 'MISSING_RETRY_TARGET'
            });
        }
        
        // Validate priority
        const validPriorities = ['low', 'normal', 'high', 'critical'];
        if (!validPriorities.includes(priority)) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid priority level',
                code: 'INVALID_PRIORITY'
            });
        }
        
        let retryCount = 0;
        const queuePriority = PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL;
        
        // Handle request-level retry
        if (requestId) {
            // Validate request exists and belongs to user
            const request = await db('Requests')
                .where('id', requestId)
                .where('user_id', req.user.id)
                .first();
            
            if (!request) {
                return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                    error: 'Request not found',
                    code: 'REQUEST_NOT_FOUND'
                });
            }
            
            // Get failed batches for this request
            const failedBatches = await db('Bouncer_Batches')
                .where('request_id', requestId)
                .whereIn('status', ['failed'])
                .where('retry_count', '<', 3); // Only retry batches that haven't exceeded retry limit
            
            // Get failed queue items
            const failedQueueItems = await db('Bouncer_Queue')
                .where('request_id', requestId)
                .where('status', 'failed');
            
            // Retry failed batches
            for (const batch of failedBatches) {
                const jobData = {
                    batchId: batch.id,
                    userId: req.user.id,
                    requestId: parseInt(requestId),
                    originalEmails: null // Will be fetched by processor
                };
                
                await emailVerificationQueue.add(
                    JOB_TYPES.RETRY_FAILED_BATCH,
                    jobData,
                    {
                        ...defaultJobOptions,
                        priority: queuePriority
                    }
                );
                
                retryCount++;
            }
            
            // Reset failed queue items to queued status
            if (failedQueueItems.length > 0) {
                await db('Bouncer_Queue')
                    .whereIn('queue_id', failedQueueItems.map(item => item.queue_id))
                    .update({
                        status: 'queued',
                        assigned_ts: null,
                        completed_ts: null
                    });
                
                retryCount += failedQueueItems.length;
            }
        }
        
        // Handle batch-level retry
        if (batchId) {
            // Validate batch exists and belongs to user
            const batch = await db('Bouncer_Batches')
                .join('Requests', 'Bouncer_Batches.request_id', 'Requests.id')
                .where('Bouncer_Batches.id', batchId)
                .where('Requests.user_id', req.user.id)
                .where('Bouncer_Batches.status', 'failed')
                .where('Bouncer_Batches.retry_count', '<', 3)
                .select('Bouncer_Batches.*')
                .first();
            
            if (!batch) {
                return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                    error: 'Batch not found or cannot be retried',
                    code: 'BATCH_NOT_FOUND'
                });
            }
            
            const jobData = {
                batchId: batch.id,
                userId: req.user.id,
                requestId: batch.request_id,
                originalEmails: null // Will be fetched by processor
            };
            
            await emailVerificationQueue.add(
                JOB_TYPES.RETRY_FAILED_BATCH,
                jobData,
                {
                    ...defaultJobOptions,
                    priority: queuePriority
                }
            );
            
            retryCount++;
        }
        
        // Handle email-level retry
        if (emails && Array.isArray(emails)) {
            // Validate emails
            const emailValidation = validateEmailArray(emails);
            if (!emailValidation.valid) {
                return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                    error: emailValidation.error,
                    code: 'INVALID_EMAIL_FORMAT'
                });
            }
            
            // Create new verification request for these emails
            const sanitizedEmails = sanitizeEmails(emails);
            
            const newRequestId = await db.transaction(async (trx) => {
                // Create main request record
                const requestRecord = await trx('Requests').insert({
                    user_id: req.user.id,
                    type: 'bouncer_verification_retry',
                    status: 'queued',
                    total_emails: sanitizedEmails.length,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                
                return requestRecord[0];
            });
            
            const jobData = {
                emails: sanitizedEmails,
                userId: req.user.id,
                requestId: newRequestId,
                options: {
                    skipDuplicates: false,
                    optimizeBatch: true,
                    isRetry: true,
                    timestamp: Date.now()
                }
            };
            
            await emailVerificationQueue.add(
                JOB_TYPES.CREATE_BATCH,
                jobData,
                {
                    ...defaultJobOptions,
                    priority: queuePriority
                }
            );
            
            retryCount += sanitizedEmails.length;
        }
        
        const processingTime = Date.now() - startTime;
        
        console.log(`[${req.user.id}] Retry failed request completed in ${processingTime}ms`);
        
        return res.status(HttpStatus.SUCCESS_STATUS).json({
            data: {
                retryCount: retryCount,
                priority: priority,
                status: 'retry_initiated',
                message: retryCount > 0 ? `Successfully initiated retry for ${retryCount} items` : 'No items found to retry',
                createdAt: new Date().toISOString()
            },
            processingTime: processingTime
        });
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Retry failed error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

// Export controllers
module.exports = {
    verifyEmails,
    getStatus,
    getResults,
    getQueueStats,
    retryFailed
}; 