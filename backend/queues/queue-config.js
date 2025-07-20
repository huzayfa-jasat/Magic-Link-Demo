const bullmq = require("bullmq");
const { Queue, QueueScheduler } = bullmq;
const IORedis = require("ioredis");

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.CACHE_SERVER_HOSTNAME || "cacheserver",
    port: process.env.CACHE_SERVER_PORT || 18747,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
    connectTimeout: 30000,
    commandTimeout: 5000
});

// Job types for different queue operations
const JOB_TYPES = {
    CREATE_BATCH: "create-batch",
    CHECK_BATCH_STATUS: "check-batch-status",
    DOWNLOAD_BATCH_RESULTS: "download-batch-results",
    CLEANUP_RATE_LIMITS: "cleanup-rate-limits",
    HEALTH_CHECK: "health-check",
    RETRY_FAILED_BATCH: "retry-failed-batch"
};

// Queue job priority levels
const PRIORITY = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25
};

// Default job options
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 2000
    },
    removeOnComplete: 50,
    removeOnFail: 100
};

// Queue instances
let emailVerificationQueue = null;
let batchStatusQueue = null;
let batchDownloadQueue = null;
let cleanupQueue = null;

// Initialize queues on first access
function initializeQueues() {
    if (emailVerificationQueue) return;
    
    try {
        emailVerificationQueue = new Queue("email-verification", { connection: redis });
        batchStatusQueue = new Queue("batch-status-check", { connection: redis });
        batchDownloadQueue = new Queue("batch-download", { connection: redis });
        cleanupQueue = new Queue("cleanup-tasks", { connection: redis });
        console.log("Queues initialized successfully");
    } catch (error) {
        console.error("Error initializing queues:", error);
        throw error;
    }
}

// Export all queue-related configurations
module.exports = {
    redis,
    JOB_TYPES,
    PRIORITY,
    defaultJobOptions,
    initializeQueues,
    get emailVerificationQueue() {
        if (!emailVerificationQueue) initializeQueues();
        return emailVerificationQueue;
    },
    get batchStatusQueue() {
        if (!batchStatusQueue) initializeQueues();
        return batchStatusQueue;
    },
    get batchDownloadQueue() {
        if (!batchDownloadQueue) initializeQueues();
        return batchDownloadQueue;
    },
    get cleanupQueue() {
        if (!cleanupQueue) initializeQueues();
        return cleanupQueue;
    }
};
