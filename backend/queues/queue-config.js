const { Queue, QueueScheduler } = require('bullmq');
const IORedis = require('ioredis');

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
    connectTimeout: 30000,
    commandTimeout: 5000
});

// Job types for different queue operations
const JOB_TYPES = {
    CREATE_BATCH: 'create-batch',
    CHECK_BATCH_STATUS: 'check-batch-status',
    DOWNLOAD_BATCH_RESULTS: 'download-batch-results',
    CLEANUP_RATE_LIMITS: 'cleanup-rate-limits',
    HEALTH_CHECK: 'health-check',
    RETRY_FAILED_BATCH: 'retry-failed-batch'
};

// Queue job priority levels
const PRIORITY = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25
};

// Queue instances
const emailVerificationQueue = new Queue('email-verification', { connection: redis });
const batchStatusQueue = new Queue('batch-status-check', { connection: redis });
const batchDownloadQueue = new Queue('batch-download', { connection: redis });
const cleanupQueue = new Queue('cleanup-tasks', { connection: redis });

// Queue schedulers for delayed/repeated jobs
const emailVerificationScheduler = new QueueScheduler('email-verification', { connection: redis });
const batchStatusScheduler = new QueueScheduler('batch-status-check', { connection: redis });
const batchDownloadScheduler = new QueueScheduler('batch-download', { connection: redis });
const cleanupScheduler = new QueueScheduler('cleanup-tasks', { connection: redis });

// Default job options
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000
    },
    removeOnComplete: 50,
    removeOnFail: 100
};

// Export all queue-related configurations
module.exports = {
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
};