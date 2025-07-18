// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');
const { getKnexInstance } = require('../../config/bouncer-config.js');

// Services
const { 
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
        'catchall-verification': emailVerificationQueue,
        'catchall-batch-status-check': batchStatusQueue,
        'catchall-batch-download': batchDownloadQueue,
        'catchall-cleanup-tasks': cleanupQueue
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
 * Verify catchall emails controller
 */
async function verifyCatchallEmails(req, res) {
    const startTime = Date.now();
    
    try {
        console.log(`[${req.user.id}] Verify catchall emails request received`);
        
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
        
        // Create catchall verification request record
        const requestId = await db.transaction(async (trx) => {
            // Create main request record
            const requestRecord = await trx('Requests').insert({
                user_id: req.user.id,
                request_type: 'bulk',
                request_status: 'pending',
                num_contacts: sanitizedEmails.length,
                num_processed: 0,
                file_name: 'catchall_verification.csv',
                start_ts: new Date()
            });
            
            const newRequestId = requestRecord[0];
            
            // First, handle emails in Contacts_Global to get global_id
            const globalIds = [];
            
            for (const email of sanitizedEmails) {
                // Check if email already exists
                const existing = await trx('Contacts_Global')
                    .where('email', email.email)
                    .select('global_id')
                    .first();
                
                if (existing) {
                    // Use existing global_id
                    globalIds.push(existing.global_id);
                } else {
                    // Insert new email and get the ID
                    const result = await trx('Contacts_Global').insert({
                        email: email.email,
                        created_ts: new Date()
                    });
                    globalIds.push(result[0]);
                }
            }
            
            // Add emails to catchall queue table for processing
            const queueItems = sanitizedEmails.map((email, index) => ({
                global_id: globalIds[index],
                user_id: req.user.id,
                request_id: newRequestId,
                status: 'queued',
                priority: PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL,
                domain_hash: email.email.split('@')[1],
                created_ts: new Date()
            }));
            
            await trx('Catchall_Queue').insert(queueItems);
            
            return newRequestId;
        });
        
        // Map priority to queue priority
        const queuePriority = PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL;
        
        // Add job to catchall verification queue
        const jobData = {
            emails: sanitizedEmails,
            userId: req.user.id,
            requestId: requestId,
            options: {
                priority: queuePriority,
                ...options
            }
        };
        
        await emailVerificationQueue.add('catchall-verification', jobData, {
            ...defaultJobOptions,
            priority: queuePriority
        });
        
        const processingTime = Date.now() - startTime;
        
        return res.status(HttpStatus.SUCCESS_STATUS).json({
            requestId: requestId,
            message: 'Catchall verification request created successfully',
            totalEmails: sanitizedEmails.length,
            processingTime: processingTime
        });
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Catchall verification error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get catchall verification status controller
 */
async function getCatchallStatus(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId } = req.params;
        const { detailed = false } = req.query;
        
        console.log(`[${req.user.id}] Catchall status request for ${requestId}`);
        
        // Validate request ID
        if (!requestId || isNaN(parseInt(requestId))) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid request ID',
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        // Get request information
        const request = await db('Requests')
            .where('request_id', requestId)
            .where('user_id', req.user.id)
            .first();
        
        if (!request) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'Request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Get catchall batch information
        const batches = await db('Catchall_Batches')
            .where('request_id', requestId)
            .orderBy('created_ts', 'desc');
        
        // Get catchall queue statistics
        const queueStats = await db('Catchall_Queue')
            .where('request_id', requestId)
            .select('status')
            .count('* as count')
            .groupBy('status');
        
        const queueCounts = queueStats.reduce((acc, stat) => {
            acc[stat.status] = parseInt(stat.count);
            return acc;
        }, {});
        
        // Calculate overall progress
        const totalEmails = request.num_contacts || 0;
        const processedEmails = (queueCounts.completed || 0) + (queueCounts.failed || 0);
        const progressPercentage = totalEmails > 0 ? Math.round((processedEmails / totalEmails) * 100) : 0;
        
        // Determine overall status
        let overallStatus = 'queued';
        if (queueCounts.failed > 0 && queueCounts.failed === totalEmails) {
            overallStatus = 'failed';
        } else if (queueCounts.completed > 0 && queueCounts.completed === totalEmails) {
            overallStatus = 'completed';
        } else if (queueCounts.completed > 0 || queueCounts.failed > 0) {
            overallStatus = 'processing';
        }
        
        const response = {
            requestId: parseInt(requestId),
            status: overallStatus,
            progress: {
                total: totalEmails,
                processed: processedEmails,
                completed: queueCounts.completed || 0,
                failed: queueCounts.failed || 0,
                queued: queueCounts.queued || 0,
                percentage: progressPercentage
            },
            batches: batches.length,
            createdAt: request.start_ts,
            updatedAt: request.end_ts
        };
        
        if (detailed) {
            response.batchDetails = batches;
        }
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Catchall status error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get catchall verification results controller
 */
async function getCatchallResults(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId } = req.params;
        const { 
            page = 1, 
            limit = 500, 
            filter = 'all',
            format = 'json'
        } = req.query;
        
        console.log(`[${req.user.id}] Catchall results request for ${requestId}`);
        
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
        const validFilters = ['all', 'good', 'bad', 'unknown'];
        if (!validFilters.includes(filter)) {
            return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
                error: 'Invalid filter',
                code: 'INVALID_FILTER'
            });
        }
        
        // Check if request exists and belongs to user
        const request = await db('Requests')
            .where('request_id', requestId)
            .where('user_id', req.user.id)
            .first();
        
        if (!request) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'Request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Get catchall batch IDs for this request
        const batches = await db('Catchall_Batches')
            .where('request_id', requestId)
            .select('id');
        
        const batchIds = batches.map(b => b.id);
        
        if (batchIds.length === 0) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'No batches found for this request',
                code: 'NO_BATCHES_FOUND'
            });
        }
        
        // Build query for catchall results
        let query = db('Catchall_Results')
            .join('Contacts_Global', 'Catchall_Results.global_id', 'Contacts_Global.global_id')
            .whereIn('Catchall_Results.batch_id', batchIds);
        
        // Apply filter
        if (filter !== 'all') {
            switch (filter) {
                case 'good':
                    query = query.where('catchall_status', 'good');
                    break;
                case 'bad':
                    query = query.where('catchall_status', 'bad');
                    break;
                case 'unknown':
                    query = query.where('catchall_status', 'unknown');
                    break;
            }
        }
        
        // Get total count
        const totalCount = await query.clone().count('* as count').first();
        const total = parseInt(totalCount.count);
        
        // Apply pagination
        const offset = (pageNum - 1) * limitNum;
        const results = await query
            .select(
                'Contacts_Global.email',
                'Catchall_Results.catchall_status',
                'Catchall_Results.catchall_reason',
                'Catchall_Results.provider',
                'Catchall_Results.score',
                'Catchall_Results.processed_ts'
            )
            .orderBy('Catchall_Results.processed_ts', 'desc')
            .limit(limitNum)
            .offset(offset);
        
        const response = {
            requestId: parseInt(requestId),
            results: results,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                pages: Math.ceil(total / limitNum)
            },
            filter: filter,
            format: format
        };
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Catchall results error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Get catchall queue statistics controller
 */
async function getCatchallQueueStats(req, res) {
    const startTime = Date.now();
    
    try {
        console.log(`[${req.user.id}] Catchall queue stats request`);
        
        // Get queue statistics
        const queueStats = await getQueueStatistics();
        
        // Get database statistics
        const dbStats = await db.raw(`
            SELECT 
                (SELECT COUNT(*) FROM Catchall_Queue WHERE status = 'queued') as queued_count,
                (SELECT COUNT(*) FROM Catchall_Queue WHERE status = 'assigned') as assigned_count,
                (SELECT COUNT(*) FROM Catchall_Queue WHERE status = 'completed') as completed_count,
                (SELECT COUNT(*) FROM Catchall_Queue WHERE status = 'failed') as failed_count,
                (SELECT COUNT(*) FROM Catchall_Batches WHERE status = 'queued') as queued_batches,
                (SELECT COUNT(*) FROM Catchall_Batches WHERE status = 'processing') as processing_batches,
                (SELECT COUNT(*) FROM Catchall_Batches WHERE status = 'completed') as completed_batches,
                (SELECT COUNT(*) FROM Catchall_Batches WHERE status = 'failed') as failed_batches
        `);
        
        const response = {
            queue: queueStats,
            database: dbStats[0][0],
            timestamp: new Date().toISOString()
        };
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Catchall queue stats error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

/**
 * Retry failed catchall verification controller
 */
async function retryCatchallFailed(req, res) {
    const startTime = Date.now();
    
    try {
        const { requestId } = req.params;
        
        console.log(`[${req.user.id}] Retry failed catchall request for ${requestId}`);
        
        // Validate request ID
        if (!requestId || isNaN(parseInt(requestId))) {
            return res.status(HttpStatus.FAILED_STATUS).json({
                error: 'Invalid request ID',
                code: 'INVALID_REQUEST_ID'
            });
        }
        
        // Check if request exists and belongs to user
        const request = await db('Requests')
            .where('request_id', requestId)
            .where('user_id', req.user.id)
            .first();
        
        if (!request) {
            return res.status(HttpStatus.NOT_FOUND_STATUS).json({
                error: 'Request not found',
                code: 'REQUEST_NOT_FOUND'
            });
        }
        
        // Get failed items from catchall queue
        const failedItems = await db('Catchall_Queue')
            .where('request_id', requestId)
            .where('status', 'failed')
            .select('*');
        
        if (failedItems.length === 0) {
            return res.status(HttpStatus.FAILED_STATUS).json({
                error: 'No failed items to retry',
                code: 'NO_FAILED_ITEMS'
            });
        }
        
        // Reset failed items to queued status
        await db('Catchall_Queue')
            .where('request_id', requestId)
            .where('status', 'failed')
            .update({
                status: 'queued',
                assigned_ts: null,
                completed_ts: null
            });
        
        // Add retry job to queue
        const jobData = {
            requestId: requestId,
            userId: req.user.id,
            retryCount: 1
        };
        
        await emailVerificationQueue.add('catchall-retry', jobData, {
            ...defaultJobOptions,
            delay: 5000 // 5 second delay before retry
        });
        
        const response = {
            requestId: parseInt(requestId),
            message: 'Failed items queued for retry',
            retryCount: failedItems.length,
            processingTime: Date.now() - startTime
        };
        
        return res.status(HttpStatus.SUCCESS_STATUS).json(response);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${req.user?.id || 'unknown'}] Catchall retry error:`, error);
        
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            processingTime: processingTime
        });
    }
}

// Export controllers
module.exports = {
    verifyCatchallEmails,
    getCatchallStatus,
    getCatchallResults,
    getCatchallQueueStats,
    retryCatchallFailed
}; 