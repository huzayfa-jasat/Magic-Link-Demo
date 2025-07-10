#!/usr/bin/env node

/**
 * Bouncer Workers Startup Script
 * 
 * This script starts all Bouncer email verification workers and queues.
 * It handles initialization, graceful shutdown, and process management.
 * 
 * Usage: node start-bouncer-workers.js
 * 
 * Environment Variables:
 * - NODE_ENV: Environment (development, production)
 * - REDIS_HOST: Redis server host
 * - REDIS_PORT: Redis server port
 * - REDIS_PASSWORD: Redis password
 * - BOUNCER_API_KEY: Bouncer API key
 * - MAX_CONCURRENT_BATCHES: Maximum concurrent batches (default: 15)
 * - RATE_LIMIT_PER_MINUTE: Rate limit per minute (default: 180)
 */

const { Worker } = require('bullmq');
const { 
    redis, 
    JOB_TYPES, 
    PRIORITY,
    emailVerificationQueue,
    batchStatusQueue,
    batchDownloadQueue,
    cleanupQueue,
    emailVerificationScheduler,
    batchStatusScheduler,
    batchDownloadScheduler,
    cleanupScheduler,
    defaultJobOptions
} = require('../queues/queue-config');

const BouncerApiService = require('../services/bouncer-api');
const RateLimiter = require('../services/rate-limiter');
const { CircuitBreaker } = require('../services/circuit-breaker');
const BouncerDb = require('../services/bouncer-db');
const HealthCheckService = require('../services/health-check');
const QueueMonitor = require('../services/queue-monitor');

// Global state management
let workers = [];
let schedulers = [];
let isShuttingDown = false;
let healthCheckInterval;
let cleanupInterval;

// Initialize services
const bouncerApi = new BouncerApiService();
const rateLimiter = new RateLimiter();
const circuitBreaker = CircuitBreaker.createForBouncerApi();
const healthCheck = new HealthCheckService();
const queueMonitor = new QueueMonitor();

// Configuration
const config = {
    maxConcurrentBatches: parseInt(process.env.MAX_CONCURRENT_BATCHES) || 15,
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 180,
    healthCheckInterval: 30000, // 30 seconds
    cleanupInterval: 300000, // 5 minutes
    gracefulShutdownTimeout: 30000, // 30 seconds
    workerConfigs: {
        emailVerification: {
            concurrency: 5,
            limiter: { max: 10, duration: 60000 }
        },
        batchStatus: {
            concurrency: 10,
            limiter: { max: 50, duration: 60000 }
        },
        batchDownload: {
            concurrency: 3,
            limiter: { max: 20, duration: 60000 }
        },
        cleanup: {
            concurrency: 1,
            limiter: { max: 5, duration: 60000 }
        }
    }
};

// Logging utility
const logger = {
    info: (message, data = {}) => {
        console.log(`[BOUNCER-WORKERS] ${new Date().toISOString()} INFO: ${message}`, data);
    },
    warn: (message, data = {}) => {
        console.warn(`[BOUNCER-WORKERS] ${new Date().toISOString()} WARN: ${message}`, data);
    },
    error: (message, error = {}) => {
        console.error(`[BOUNCER-WORKERS] ${new Date().toISOString()} ERROR: ${message}`, error);
    },
    debug: (message, data = {}) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[BOUNCER-WORKERS] ${new Date().toISOString()} DEBUG: ${message}`, data);
        }
    }
};

// =============================================================================
// WORKER PROCESSORS
// =============================================================================

/**
 * Process email verification jobs
 */
async function processEmailVerification(job) {
    const { emails, userId, requestId } = job.data;
    
    try {
        logger.info('Processing email verification job', {
            jobId: job.id,
            jobType: job.name,
            emailCount: emails?.length,
            userId,
            requestId
        });

        switch (job.name) {
            case JOB_TYPES.CREATE_BATCH:
                return await processBatchCreation(emails, userId, requestId);
            case JOB_TYPES.RETRY_FAILED_BATCH:
                return await retryFailedBatch(job.data.batchId);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    } catch (error) {
        logger.error('Email verification job failed', {
            jobId: job.id,
            jobType: job.name,
            error: error.message,
            userId,
            requestId
        });
        throw error;
    }
}

/**
 * Process batch status check jobs
 */
async function processBatchStatusCheck(job) {
    const { batchId } = job.data;
    
    try {
        logger.debug('Processing batch status check job', {
            jobId: job.id,
            batchId
        });

        return await checkBatchStatus(batchId);
    } catch (error) {
        logger.error('Batch status check job failed', {
            jobId: job.id,
            batchId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Process batch download jobs
 */
async function processBatchDownload(job) {
    const { batchId } = job.data;
    
    try {
        logger.info('Processing batch download job', {
            jobId: job.id,
            batchId
        });

        return await downloadBatchResults(batchId);
    } catch (error) {
        logger.error('Batch download job failed', {
            jobId: job.id,
            batchId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Process cleanup jobs
 */
async function processCleanup(job) {
    try {
        logger.info('Processing cleanup job', {
            jobId: job.id,
            jobType: job.name
        });

        switch (job.name) {
            case JOB_TYPES.CLEANUP_RATE_LIMITS:
                return await cleanupRateLimits();
            case JOB_TYPES.HEALTH_CHECK:
                return await performHealthCheck();
            default:
                throw new Error(`Unknown cleanup job type: ${job.name}`);
        }
    } catch (error) {
        logger.error('Cleanup job failed', {
            jobId: job.id,
            jobType: job.name,
            error: error.message
        });
        throw error;
    }
}

// =============================================================================
// BUSINESS LOGIC FUNCTIONS
// =============================================================================

/**
 * Create a new batch for email verification
 */
async function processBatchCreation(emails, userId, requestId) {
    // Check concurrent batch limit
    const activeBatches = await BouncerDb.getActiveBatchCount();
    if (activeBatches >= config.maxConcurrentBatches) {
        logger.warn('Max concurrent batches reached', { activeBatches, maxConcurrentBatches: config.maxConcurrentBatches });
        
        // Re-queue with delay
        await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            { emails, userId, requestId },
            { delay: 60000, priority: PRIORITY.HIGH }
        );
        return { status: 'deferred', reason: 'max_batches_reached' };
    }

    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        const nextAvailable = await rateLimiter.getNextAvailableTime();
        const delay = nextAvailable.getTime() - Date.now();
        
        logger.warn('Rate limit exceeded, deferring batch creation', { delay, nextAvailable });
        
        await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            { emails, userId, requestId },
            { delay: Math.max(delay, 0), priority: PRIORITY.HIGH }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }

    // Optimize batch composition
    const optimizedBatch = await optimizeBatchComposition(emails);
    
    // Create batch through circuit breaker
    const batch = await circuitBreaker.executeApiCall(async () => {
        await rateLimiter.recordApiCall();
        return await bouncerApi.createBatch(optimizedBatch, userId, requestId);
    });

    // Schedule status check
    await batchStatusQueue.add(
        JOB_TYPES.CHECK_BATCH_STATUS,
        { batchId: batch.id },
        { delay: 30000, priority: PRIORITY.NORMAL }
    );

    logger.info('Batch created successfully', {
        batchId: batch.id,
        bouncerBatchId: batch.batch_id,
        quantity: batch.quantity
    });

    return { status: 'created', batchId: batch.id };
}

/**
 * Check batch status
 */
async function checkBatchStatus(batchId) {
    const batch = await BouncerDb.getBatchById(batchId);
    if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
    }

    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        logger.debug('Rate limit exceeded, deferring status check', { batchId });
        
        await batchStatusQueue.add(
            JOB_TYPES.CHECK_BATCH_STATUS,
            { batchId },
            { delay: 60000, priority: PRIORITY.NORMAL }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }

    // Get status through circuit breaker
    const status = await circuitBreaker.executeApiCall(async () => {
        await rateLimiter.recordApiCall();
        return await bouncerApi.getBatchStatus(batch.batch_id);
    });

    if (status.status === 'completed') {
        // Update batch status
        await BouncerDb.updateBatchStatus(batchId, 'completed');
        
        // Schedule download
        await batchDownloadQueue.add(
            JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
            { batchId },
            { priority: PRIORITY.CRITICAL }
        );
        
        logger.info('Batch completed, download scheduled', { batchId });
        return { status: 'completed', ready_for_download: true };
    } else if (status.status === 'failed') {
        await handleBatchFailure(batch);
        return { status: 'failed' };
    } else {
        // Still processing, check again later
        await batchStatusQueue.add(
            JOB_TYPES.CHECK_BATCH_STATUS,
            { batchId },
            { delay: 30000, priority: PRIORITY.NORMAL }
        );
        return { status: 'processing' };
    }
}

/**
 * Download batch results
 */
async function downloadBatchResults(batchId) {
    const batch = await BouncerDb.getBatchById(batchId);
    if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
    }

    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        logger.debug('Rate limit exceeded, deferring download', { batchId });
        
        await batchDownloadQueue.add(
            JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
            { batchId },
            { delay: 60000, priority: PRIORITY.CRITICAL }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }

    // Download results through circuit breaker
    const results = await circuitBreaker.executeApiCall(async () => {
        await rateLimiter.recordApiCall();
        return await bouncerApi.downloadBatchResults(batch.batch_id);
    });

    // Process results
    await BouncerDb.completeBatchProcessing(batchId, results);

    logger.info('Batch results downloaded and processed', {
        batchId,
        resultsCount: results.length
    });

    return { status: 'downloaded', results_count: results.length };
}

/**
 * Retry failed batch
 */
async function retryFailedBatch(batchId) {
    const batch = await BouncerDb.getBatchById(batchId);
    if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
    }

    // Check retry count
    if (batch.retry_count >= 3) {
        await BouncerDb.addToDeadLetterQueue(
            batchId,
            batch.user_id,
            batch.request_id,
            'Max retry attempts exceeded'
        );
        logger.error('Batch moved to dead letter queue', { batchId, retryCount: batch.retry_count });
        return { status: 'dead_letter', reason: 'max_retries_exceeded' };
    }

    // Increment retry count
    await BouncerDb.incrementBatchRetryCount(batchId);
    
    // Reset batch status and schedule retry
    await BouncerDb.updateBatchStatus(batchId, 'queued');
    
    await batchStatusQueue.add(
        JOB_TYPES.CHECK_BATCH_STATUS,
        { batchId },
        { delay: 60000, priority: PRIORITY.HIGH }
    );

    logger.info('Batch retry scheduled', { batchId, retryCount: batch.retry_count + 1 });
    return { status: 'retry_scheduled' };
}

/**
 * Handle batch failure
 */
async function handleBatchFailure(batch) {
    logger.error('Batch failed', { batchId: batch.id, bouncerBatchId: batch.batch_id });
    
    await BouncerDb.updateBatchStatus(batch.id, 'failed', 'Batch processing failed');
    
    // Schedule retry
    await emailVerificationQueue.add(
        JOB_TYPES.RETRY_FAILED_BATCH,
        { batchId: batch.id },
        { delay: 120000, priority: PRIORITY.HIGH }
    );
}

/**
 * Optimize batch composition (non-homogeneous)
 */
async function optimizeBatchComposition(emails) {
    // Group by domain
    const domainGroups = {};
    
    emails.forEach(email => {
        const domain = email.email.split('@')[1];
        if (!domainGroups[domain]) {
            domainGroups[domain] = [];
        }
        domainGroups[domain].push(email);
    });

    // Interleave emails from different domains
    const optimizedBatch = [];
    const domains = Object.keys(domainGroups);
    
    while (optimizedBatch.length < emails.length) {
        for (const domain of domains) {
            if (domainGroups[domain].length > 0) {
                optimizedBatch.push(domainGroups[domain].shift());
            }
        }
    }

    logger.debug('Batch composition optimized', {
        originalCount: emails.length,
        optimizedCount: optimizedBatch.length,
        domainsCount: domains.length
    });

    return optimizedBatch;
}

/**
 * Cleanup old rate limit records
 */
async function cleanupRateLimits() {
    const deleted = await BouncerDb.cleanupRateLimitRecords(60);
    logger.info('Rate limit records cleaned up', { deleted });
    return { deleted };
}

/**
 * Perform health check
 */
async function performHealthCheck() {
    const health = await BouncerDb.getSystemHealthStatus();
    
    // Add additional health checks
    health.redis_connection = await checkRedisHealth();
    health.circuit_breaker = circuitBreaker.getStats();
    health.queue_stats = await queueMonitor.getQueueStats();

    logger.debug('Health check performed', health);
    return health;
}

/**
 * Check Redis health
 */
async function checkRedisHealth() {
    try {
        await redis.ping();
        return true;
    } catch (error) {
        logger.error('Redis health check failed', { error: error.message });
        return false;
    }
}

// =============================================================================
// WORKER MANAGEMENT
// =============================================================================

/**
 * Initialize and start all workers
 */
async function startWorkers() {
    logger.info('Starting Bouncer workers...', { config });

    try {
        // Initialize schedulers
        schedulers = [
            emailVerificationScheduler,
            batchStatusScheduler,
            batchDownloadScheduler,
            cleanupScheduler
        ];

        // Email verification worker
        const emailVerificationWorker = new Worker(
            'email-verification',
            processEmailVerification,
            {
                connection: redis,
                concurrency: config.workerConfigs.emailVerification.concurrency,
                limiter: config.workerConfigs.emailVerification.limiter
            }
        );

        // Batch status worker
        const batchStatusWorker = new Worker(
            'batch-status-check',
            processBatchStatusCheck,
            {
                connection: redis,
                concurrency: config.workerConfigs.batchStatus.concurrency,
                limiter: config.workerConfigs.batchStatus.limiter
            }
        );

        // Batch download worker
        const batchDownloadWorker = new Worker(
            'batch-download',
            processBatchDownload,
            {
                connection: redis,
                concurrency: config.workerConfigs.batchDownload.concurrency,
                limiter: config.workerConfigs.batchDownload.limiter
            }
        );

        // Cleanup worker
        const cleanupWorker = new Worker(
            'cleanup-tasks',
            processCleanup,
            {
                connection: redis,
                concurrency: config.workerConfigs.cleanup.concurrency,
                limiter: config.workerConfigs.cleanup.limiter
            }
        );

        // Store workers
        workers = [
            emailVerificationWorker,
            batchStatusWorker,
            batchDownloadWorker,
            cleanupWorker
        ];

        // Set up worker event handlers
        workers.forEach(worker => {
            worker.on('completed', (job, result) => {
                logger.debug('Job completed', {
                    queue: worker.name,
                    jobId: job.id,
                    jobType: job.name,
                    result: typeof result === 'object' ? JSON.stringify(result) : result
                });
            });

            worker.on('failed', (job, error) => {
                logger.error('Job failed', {
                    queue: worker.name,
                    jobId: job?.id,
                    jobType: job?.name,
                    error: error.message,
                    attempts: job?.attemptsMade,
                    maxAttempts: job?.opts?.attempts
                });
            });

            worker.on('error', (error) => {
                logger.error('Worker error', {
                    queue: worker.name,
                    error: error.message
                });
            });
        });

        logger.info('All workers started successfully', {
            workerCount: workers.length,
            schedulerCount: schedulers.length
        });

        // Schedule initial cleanup tasks
        await scheduleCleanupTasks();

        // Start health check monitoring
        startHealthCheckMonitoring();

    } catch (error) {
        logger.error('Failed to start workers', { error: error.message });
        throw error;
    }
}

/**
 * Schedule recurring cleanup tasks
 */
async function scheduleCleanupTasks() {
    // Schedule rate limit cleanup every 5 minutes
    await cleanupQueue.add(
        JOB_TYPES.CLEANUP_RATE_LIMITS,
        {},
        {
            repeat: { every: 300000 }, // 5 minutes
            removeOnComplete: 5,
            removeOnFail: 5
        }
    );

    // Schedule health check every 30 seconds
    await cleanupQueue.add(
        JOB_TYPES.HEALTH_CHECK,
        {},
        {
            repeat: { every: 30000 }, // 30 seconds
            removeOnComplete: 10,
            removeOnFail: 10
        }
    );

    logger.info('Cleanup tasks scheduled');
}

/**
 * Start health check monitoring
 */
function startHealthCheckMonitoring() {
    healthCheckInterval = setInterval(async () => {
        try {
            await performHealthCheck();
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
        }
    }, config.healthCheckInterval);

    logger.info('Health check monitoring started');
}

/**
 * Graceful shutdown of all workers
 */
async function shutdown() {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
    }

    isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    const shutdownPromises = [];

    // Clear intervals
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }

    // Close workers
    workers.forEach(worker => {
        shutdownPromises.push(
            worker.close().catch(error => {
                logger.error('Error closing worker', { 
                    workerName: worker.name, 
                    error: error.message 
                });
            })
        );
    });

    // Close schedulers
    schedulers.forEach(scheduler => {
        shutdownPromises.push(
            scheduler.close().catch(error => {
                logger.error('Error closing scheduler', { 
                    error: error.message 
                });
            })
        );
    });

    // Wait for all shutdowns with timeout
    try {
        await Promise.race([
            Promise.all(shutdownPromises),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Shutdown timeout')), config.gracefulShutdownTimeout)
            )
        ]);
        logger.info('All workers and schedulers closed successfully');
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
    }

    // Close Redis connection
    try {
        await redis.quit();
        logger.info('Redis connection closed');
    } catch (error) {
        logger.error('Error closing Redis connection', { error: error.message });
    }

    logger.info('Shutdown complete');
}

// =============================================================================
// PROCESS MANAGEMENT
// =============================================================================

/**
 * Handle process signals for graceful shutdown
 */
function setupProcessHandlers() {
    // Handle SIGTERM (graceful shutdown)
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, initiating graceful shutdown...');
        await shutdown();
        process.exit(0);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT, initiating graceful shutdown...');
        await shutdown();
        process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', { error: error.message, stack: error.stack });
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled promise rejection', { reason, promise });
        process.exit(1);
    });

    logger.info('Process handlers set up');
}

/**
 * Validate environment and configuration
 */
function validateEnvironment() {
    const required = ['BOUNCER_API_KEY', 'REDIS_HOST'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        logger.error('Missing required environment variables', { missing });
        process.exit(1);
    }

    logger.info('Environment validation passed');
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main startup function
 */
async function main() {
    try {
        logger.info('Starting Bouncer Workers System', {
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            pid: process.pid
        });

        // Validate environment
        validateEnvironment();

        // Set up process handlers
        setupProcessHandlers();

        // Initialize Redis connection
        await redis.connect();
        logger.info('Redis connection established');

        // Start workers
        await startWorkers();

        // Log startup success
        logger.info('Bouncer Workers System started successfully', {
            workers: workers.length,
            schedulers: schedulers.length,
            config: {
                maxConcurrentBatches: config.maxConcurrentBatches,
                rateLimitPerMinute: config.rateLimitPerMinute
            }
        });

        // Keep process alive
        process.stdout.write('Bouncer Workers System is running. Press Ctrl+C to stop.\n');

    } catch (error) {
        logger.error('Failed to start Bouncer Workers System', { 
            error: error.message, 
            stack: error.stack 
        });
        process.exit(1);
    }
}

// Start the system if this script is run directly
if (require.main === module) {
    main();
}

module.exports = {
    main,
    startWorkers,
    shutdown,
    config,
    workers,
    schedulers
};