/**
 * Batch Status Queue Processor
 * 
 * Processes batch status checking jobs for the Bouncer email verification system.
 * Handles:
 * - CHECK_BATCH_STATUS job processing
 * - Status monitoring logic
 * - Download job scheduling when complete
 * - Retry scheduling for in-progress batches
 * 
 * Features:
 * - Concurrency: 10 workers with rate limiting
 * - Different batch status handling (completed, failed, processing)
 * - Proper error handling and logging
 * - Production-ready implementation
 */

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const knex = require('knex')(require('../../knexfile.js').development);

// Job types constants
const JOB_TYPES = {
    CHECK_BATCH_STATUS: 'check-batch-status',
    DOWNLOAD_BATCH_RESULTS: 'download-batch-results'
};

// Priority levels
const PRIORITY = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25
};

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 3
});

// Import required queues
const { Queue } = require('bullmq');
const batchStatusQueue = new Queue('batch-status-check', { connection: redis });
const batchDownloadQueue = new Queue('batch-download', { connection: redis });

// Rate limiter class
class RateLimiter {
    constructor() {
        this.windowSizeMs = 60000; // 1 minute window
        this.maxRequests = 180; // Conservative limit (20 buffer from 200)
    }
    
    async canMakeApiCall() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowSizeMs);
        
        // Count requests in current window
        const currentCount = await knex('Bouncer_Rate_Limit')
            .where('window_start_ts', '>=', windowStart)
            .count('* as count')
            .first();
        
        return currentCount.count < this.maxRequests;
    }
    
    async recordApiCall() {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + this.windowSizeMs);
        
        await knex('Bouncer_Rate_Limit').insert({
            request_count: 1,
            window_start_ts: now,
            window_end_ts: windowEnd
        });
    }
    
    async getNextAvailableTime() {
        const oldestRequest = await knex('Bouncer_Rate_Limit')
            .orderBy('window_start_ts', 'asc')
            .limit(1)
            .offset(this.maxRequests - 1)
            .first();
        
        if (!oldestRequest) {
            return new Date(); // Can make request now
        }
        
        return new Date(oldestRequest.window_start_ts.getTime() + this.windowSizeMs);
    }
}

const rateLimiter = new RateLimiter();

// Circuit breaker for API resilience
class CircuitBreaker {
    constructor() {
        this.failureThreshold = 5;
        this.recoveryTimeout = 60000; // 1 minute
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
    }
    
    async executeApiCall(apiCall) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await apiCall();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
}

const circuitBreaker = new CircuitBreaker();

// Error handler for classification
class ErrorHandler {
    classifyError(error) {
        if (error.status === 429) return 'RATE_LIMIT';
        if (error.status === 402) return 'PAYMENT_REQUIRED';
        if (error.status >= 500) return 'API_ERROR';
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return 'NETWORK_ERROR';
        if (error.status === 400) return 'PERMANENT_FAILURE';
        
        return 'GENERIC_ERROR';
    }
    
    shouldRetry(errorType) {
        return ['RATE_LIMIT', 'API_ERROR', 'NETWORK_ERROR', 'GENERIC_ERROR'].includes(errorType);
    }
    
    getRetryDelay(errorType, retryCount) {
        const baseDelay = 2000; // 2 seconds
        const maxDelay = 300000; // 5 minutes
        
        if (errorType === 'RATE_LIMIT') {
            return 60000; // 1 minute for rate limit
        }
        
        // Exponential backoff
        const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        return delay;
    }
}

const errorHandler = new ErrorHandler();

// Database helper functions
async function getBatchInfo(batchId) {
    try {
        const batch = await knex('Bouncer_Batches')
            .where('id', batchId)
            .first();
        
        return batch;
    } catch (error) {
        console.error('Error getting batch info:', error);
        throw error;
    }
}

async function updateBatchStatus(batchId, status, errorMessage = null) {
    try {
        const updateData = {
            status,
            updated_ts: new Date()
        };
        
        if (status === 'completed') {
            updateData.completed_ts = new Date();
        }
        
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }
        
        await knex('Bouncer_Batches')
            .where('id', batchId)
            .update(updateData);
        
        return true;
    } catch (error) {
        console.error('Error updating batch status:', error);
        throw error;
    }
}

async function incrementBatchRetryCount(batchId) {
    try {
        await knex('Bouncer_Batches')
            .where('id', batchId)
            .increment('retry_count', 1);
        
        return true;
    } catch (error) {
        console.error('Error incrementing retry count:', error);
        throw error;
    }
}

async function addToDeadLetterQueue(batch, errorMessage) {
    try {
        await knex('Bouncer_Dead_Letter_Queue').insert({
            batch_id: batch.id,
            user_id: batch.user_id,
            request_id: batch.request_id,
            error_message: errorMessage,
            failed_ts: new Date()
        });
        
        return true;
    } catch (error) {
        console.error('Error adding to dead letter queue:', error);
        throw error;
    }
}

// Bouncer API functions
async function getBouncerBatchStatus(bouncerBatchId) {
    const fetch = require('node-fetch');
    const apiKey = process.env.BOUNCER_API_KEY;
    const baseUrl = process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1';
    
    if (!apiKey) {
        throw new Error('BOUNCER_API_KEY environment variable not set');
    }
    
    const url = `${baseUrl}/email/batch/${bouncerBatchId}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
    }
    
    const data = await response.json();
    return data;
}

// Main batch status checking function
async function checkBatchStatus(batchId) {
    console.log(`Checking status for batch ID: ${batchId}`);
    
    try {
        // Get batch information
        const batch = await getBatchInfo(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }
        
        // Skip if batch is already completed or failed
        if (['completed', 'failed'].includes(batch.status)) {
            console.log(`Batch ${batchId} already in final state: ${batch.status}`);
            return { status: batch.status, reason: 'already_final' };
        }
        
        // Check rate limit
        if (!(await rateLimiter.canMakeApiCall())) {
            console.log(`Rate limit reached for batch ${batchId}, rescheduling...`);
            
            const nextAvailable = await rateLimiter.getNextAvailableTime();
            const delay = Math.max(nextAvailable.getTime() - Date.now(), 60000); // Min 1 minute
            
            await batchStatusQueue.add(
                JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId },
                { delay }
            );
            
            return { status: 'deferred', reason: 'rate_limit' };
        }
        
        // Make API call with circuit breaker
        const statusResult = await circuitBreaker.executeApiCall(async () => {
            await rateLimiter.recordApiCall();
            return await getBouncerBatchStatus(batch.batch_id);
        });
        
        console.log(`Batch ${batchId} status from API:`, statusResult.status);
        
        // Handle different statuses
        if (statusResult.status === 'completed') {
            // Update batch status to completed
            await updateBatchStatus(batchId, 'completed');
            
            // Schedule download job with high priority
            await batchDownloadQueue.add(
                JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
                { batchId },
                { priority: PRIORITY.CRITICAL }
            );
            
            console.log(`Batch ${batchId} completed, download job scheduled`);
            return { status: 'completed', ready_for_download: true };
            
        } else if (statusResult.status === 'failed') {
            // Handle batch failure
            await handleBatchFailure(batch, statusResult.reason || 'Unknown failure');
            
            console.log(`Batch ${batchId} failed:`, statusResult.reason);
            return { status: 'failed', reason: statusResult.reason };
            
        } else if (['processing', 'queued'].includes(statusResult.status)) {
            // Still processing, schedule another check
            const delay = 30000; // 30 seconds for processing batches
            
            await batchStatusQueue.add(
                JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId },
                { delay }
            );
            
            console.log(`Batch ${batchId} still processing, next check in 30 seconds`);
            return { status: 'processing', next_check: delay };
            
        } else {
            // Unknown status
            console.warn(`Unknown batch status for ${batchId}: ${statusResult.status}`);
            
            // Schedule retry with longer delay
            await batchStatusQueue.add(
                JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId },
                { delay: 60000 } // 1 minute
            );
            
            return { status: 'unknown', api_status: statusResult.status };
        }
        
    } catch (error) {
        console.error(`Error checking batch status for ${batchId}:`, error);
        
        const errorType = errorHandler.classifyError(error);
        
        // Get current retry count
        const batch = await getBatchInfo(batchId);
        const retryCount = batch ? batch.retry_count : 0;
        
        if (errorHandler.shouldRetry(errorType) && retryCount < 5) {
            // Increment retry count
            await incrementBatchRetryCount(batchId);
            
            // Schedule retry with backoff
            const delay = errorHandler.getRetryDelay(errorType, retryCount);
            
            await batchStatusQueue.add(
                JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId },
                { delay }
            );
            
            console.log(`Batch ${batchId} check failed (${errorType}), retrying in ${delay}ms`);
            return { status: 'retry_scheduled', error_type: errorType, retry_count: retryCount + 1 };
        } else {
            // Permanent failure or max retries reached
            await handleBatchFailure(batch, error.message);
            
            console.error(`Batch ${batchId} permanently failed:`, error.message);
            return { status: 'permanent_failure', error: error.message };
        }
    }
}

async function handleBatchFailure(batch, errorMessage) {
    try {
        // Update batch status to failed
        await updateBatchStatus(batch.id, 'failed', errorMessage);
        
        // Add to dead letter queue for manual review
        await addToDeadLetterQueue(batch, errorMessage);
        
        // Update queue items to failed status
        await knex('Bouncer_Queue')
            .where('batch_id', batch.id)
            .update({
                status: 'failed',
                completed_ts: new Date()
            });
        
        console.log(`Batch ${batch.id} marked as failed and added to dead letter queue`);
        
    } catch (error) {
        console.error('Error handling batch failure:', error);
        throw error;
    }
}

// Health check function
async function performHealthCheck() {
    try {
        const health = {
            timestamp: new Date(),
            redis_connected: redis.status === 'ready',
            database_connected: false,
            rate_limit_status: null,
            circuit_breaker_state: circuitBreaker.state
        };
        
        // Test database connection
        try {
            await knex.raw('SELECT 1');
            health.database_connected = true;
        } catch (error) {
            health.database_connected = false;
        }
        
        // Get rate limit status
        try {
            const canMakeCall = await rateLimiter.canMakeApiCall();
            health.rate_limit_status = canMakeCall ? 'available' : 'exhausted';
        } catch (error) {
            health.rate_limit_status = 'error';
        }
        
        // Store health metrics
        await knex('Bouncer_Health_Metrics').insert([
            { metric_name: 'redis_connected', metric_value: health.redis_connected ? 1 : 0 },
            { metric_name: 'database_connected', metric_value: health.database_connected ? 1 : 0 },
            { metric_name: 'rate_limit_available', metric_value: health.rate_limit_status === 'available' ? 1 : 0 }
        ]);
        
        return health;
    } catch (error) {
        console.error('Health check failed:', error);
        return { timestamp: new Date(), status: 'error', error: error.message };
    }
}

// Create and configure the batch status worker
const batchStatusWorker = new Worker(
    'batch-status-check',
    async (job) => {
        const { batchId } = job.data;
        
        if (job.name === JOB_TYPES.CHECK_BATCH_STATUS) {
            return await checkBatchStatus(batchId);
        } else {
            throw new Error(`Unknown job type: ${job.name}`);
        }
    },
    { 
        connection: redis,
        concurrency: 10, // Process up to 10 jobs simultaneously
        limiter: {
            max: 50,     // Max 50 status checks per minute
            duration: 60000 // 1 minute
        },
        settings: {
            stalledInterval: 30000,  // Check for stalled jobs every 30 seconds
            maxStalledCount: 3       // Max 3 stalled jobs before failing
        }
    }
);

// Worker event handlers
batchStatusWorker.on('completed', (job, result) => {
    console.log(`Batch status job ${job.id} completed:`, result);
});

batchStatusWorker.on('failed', (job, error) => {
    console.error(`Batch status job ${job.id} failed:`, error);
});

batchStatusWorker.on('progress', (job, progress) => {
    console.log(`Batch status job ${job.id} progress:`, progress);
});

batchStatusWorker.on('stalled', (job) => {
    console.warn(`Batch status job ${job.id} stalled`);
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
    console.log('Shutting down batch status worker gracefully...');
    
    try {
        await batchStatusWorker.close();
        await redis.quit();
        await knex.destroy();
        console.log('Batch status worker shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down batch status worker gracefully...');
    
    try {
        await batchStatusWorker.close();
        await redis.quit();
        await knex.destroy();
        console.log('Batch status worker shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Export for testing and external use
module.exports = {
    batchStatusWorker,
    checkBatchStatus,
    rateLimiter,
    circuitBreaker,
    errorHandler,
    performHealthCheck,
    JOB_TYPES,
    PRIORITY
};