# Bouncer Email Verification Implementation Plan

## Overview

This document outlines the implementation plan for integrating Bouncer email verification API with a managed queue system using BullMQ. The system will handle batch processing of up to 10,000 emails per batch, with a maximum of 15 concurrent batches, while respecting the 200 requests/minute rate limit.

## Requirements Summary

- **Batch Processing**: 10,000 emails per batch, max 15 concurrent batches
- **Rate Limiting**: 200 API requests per minute (combined upload/status/download)
- **Queue Persistence**: Must survive application restarts
- **Error Handling**: Comprehensive retry logic for network issues, rate limits, payment errors
- **Optimizations**: Non-homogeneous batch composition for better performance

## Database Schema Extensions

### Core Tables

```sql
-- Bouncer batch tracking
DROP TABLE IF EXISTS `Bouncer_Batches`;
CREATE TABLE Bouncer_Batches (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` varchar(50) NOT NULL, -- From Bouncer API
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `status` enum('queued', 'processing', 'completed', 'failed', 'downloading') NOT NULL DEFAULT 'queued',
    `quantity` int NOT NULL,
    `duplicates` int NOT NULL DEFAULT 0,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `completed_ts` TIMESTAMP NULL,
    `error_message` TEXT,
    `retry_count` int NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY (`batch_id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    INDEX idx_status (`status`),
    INDEX idx_created (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Queue for emails waiting to be processed
DROP TABLE IF EXISTS `Bouncer_Queue`;
CREATE TABLE Bouncer_Queue (
    `queue_id` int AUTO_INCREMENT NOT NULL,
    `global_id` int NOT NULL,
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `batch_id` int NULL, -- References Bouncer_Batches.id when assigned
    `status` enum('queued', 'assigned', 'completed', 'failed') NOT NULL DEFAULT 'queued',
    `priority` int NOT NULL DEFAULT 0, -- For queue ordering (higher = higher priority)
    `domain_hash` varchar(64), -- For optimization: grouping by domain
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `assigned_ts` TIMESTAMP NULL,
    `completed_ts` TIMESTAMP NULL,
    PRIMARY KEY (`queue_id`),
    FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    FOREIGN KEY (`batch_id`) REFERENCES Bouncer_Batches(`id`) ON DELETE SET NULL,
    INDEX idx_status_priority (`status`, `priority` DESC),
    INDEX idx_domain_hash (`domain_hash`),
    INDEX idx_created (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Rate limiting tracking
DROP TABLE IF EXISTS `Bouncer_Rate_Limit`;
CREATE TABLE Bouncer_Rate_Limit (
    `id` int AUTO_INCREMENT NOT NULL,
    `request_count` int NOT NULL DEFAULT 0,
    `window_start_ts` TIMESTAMP NOT NULL,
    `window_end_ts` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    INDEX idx_window (`window_start_ts`, `window_end_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Detailed results from Bouncer
DROP TABLE IF EXISTS `Bouncer_Results`;
CREATE TABLE Bouncer_Results (
    `batch_id` int NOT NULL,
    `global_id` int NOT NULL,
    `bouncer_status` varchar(50) NOT NULL, -- deliverable, undeliverable, etc.
    `bouncer_reason` varchar(100),
    `domain_info` JSON,
    `account_info` JSON,
    `dns_info` JSON,
    `provider` varchar(100),
    `score` int,
    `toxic` varchar(20),
    `toxicity` int,
    `processed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`batch_id`, `global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Bouncer_Batches(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Dead letter queue for permanently failed items
DROP TABLE IF EXISTS `Bouncer_Dead_Letter_Queue`;
CREATE TABLE Bouncer_Dead_Letter_Queue (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` int NOT NULL,
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `error_message` TEXT NOT NULL,
    `failed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `reviewed` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    INDEX idx_failed_ts (`failed_ts`),
    INDEX idx_reviewed (`reviewed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- System health monitoring
DROP TABLE IF EXISTS `Bouncer_Health_Metrics`;
CREATE TABLE Bouncer_Health_Metrics (
    `id` int AUTO_INCREMENT NOT NULL,
    `metric_name` varchar(100) NOT NULL,
    `metric_value` int NOT NULL,
    `recorded_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_metric_time (`metric_name`, `recorded_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
```

## BullMQ Queue Architecture

### Queue Structure

The system uses 4 separate BullMQ queues:

1. **Email Verification Queue** (`email-verification`)
   - Handles batch creation
   - Manages retry logic for failed batches
   - Concurrency: 5 workers

2. **Batch Status Queue** (`batch-status-check`)
   - Monitors batch processing status
   - Schedules result downloads when batches complete
   - Concurrency: 10 workers

3. **Batch Download Queue** (`batch-download`)
   - Downloads completed batch results
   - Processes and stores results in database
   - Concurrency: 3 workers

4. **Cleanup Queue** (`cleanup-tasks`)
   - Performs housekeeping tasks
   - Cleans up old rate limit records
   - Health checks and monitoring
   - Concurrency: 1 worker

### Queue Configuration

```javascript
import { Queue, Worker, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 3
});

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
```

### Job Types and Processing

```javascript
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
```

### Worker Configuration

Each queue has specific worker configurations:

```javascript
// Email verification worker
const emailVerificationWorker = new Worker(
    'email-verification',
    async (job) => {
        const { emails, userId, requestId } = job.data;
        
        switch (job.name) {
            case JOB_TYPES.CREATE_BATCH:
                return await processBatchCreation(emails, userId, requestId);
            case JOB_TYPES.RETRY_FAILED_BATCH:
                return await retryFailedBatch(job.data.batchId);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
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

// Batch status worker
const batchStatusWorker = new Worker(
    'batch-status-check',
    async (job) => {
        const { batchId } = job.data;
        return await checkBatchStatus(batchId);
    },
    { 
        connection: redis,
        concurrency: 10, // Higher concurrency for status checks
        limiter: {
            max: 50,     // Max 50 status checks per minute
            duration: 60000
        }
    }
);

// Batch download worker
const batchDownloadWorker = new Worker(
    'batch-download',
    async (job) => {
        const { batchId } = job.data;
        return await downloadBatchResults(batchId);
    },
    { 
        connection: redis,
        concurrency: 3, // Limited concurrency for downloads
        limiter: {
            max: 20,     // Max 20 downloads per minute
            duration: 60000
        }
    }
);
```

## Rate Limiting Strategy

### Implementation

```javascript
class RateLimiter {
    constructor() {
        this.windowSizeMs = 60000; // 1 minute window
        this.maxRequests = 180; // Conservative limit (20 buffer)
    }
    
    async canMakeApiCall() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowSizeMs);
        
        // Count requests in current window
        const currentCount = await db.query(`
            SELECT COUNT(*) as count 
            FROM Bouncer_Rate_Limit 
            WHERE window_start_ts >= ?
        `, [windowStart]);
        
        return currentCount[0].count < this.maxRequests;
    }
    
    async recordApiCall() {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + this.windowSizeMs);
        
        await db.query(`
            INSERT INTO Bouncer_Rate_Limit (request_count, window_start_ts, window_end_ts)
            VALUES (1, ?, ?)
        `, [now, windowEnd]);
    }
    
    async getNextAvailableTime() {
        const oldestRequest = await db.query(`
            SELECT window_start_ts 
            FROM Bouncer_Rate_Limit 
            ORDER BY window_start_ts ASC 
            LIMIT 1 OFFSET ?
        `, [this.maxRequests - 1]);
        
        if (oldestRequest.length === 0) {
            return new Date(); // Can make request now
        }
        
        return new Date(oldestRequest[0].window_start_ts.getTime() + this.windowSizeMs);
    }
}
```

### Rate Limit Integration with BullMQ

When rate limits are hit, jobs are automatically rescheduled:

```javascript
async function processBatchCreation(emails, userId, requestId) {
    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        const nextAvailable = await rateLimiter.getNextAvailableTime();
        const delay = nextAvailable.getTime() - Date.now();
        
        // Re-queue with appropriate delay
        await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            { emails, userId, requestId },
            { delay: Math.max(delay, 0) }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }
    
    // Proceed with batch creation
    const batch = await createBouncerBatch(emails, userId, requestId);
    return { status: 'created', batchId: batch.id };
}
```

## Error Handling and Retry Logic

### Error Classification

```javascript
class ErrorHandler {
    classifyError(error) {
        if (error.status === 429) return 'RATE_LIMIT';
        if (error.status === 402) return 'PAYMENT_REQUIRED';
        if (error.status >= 500) return 'API_ERROR';
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return 'NETWORK_ERROR';
        if (error.status === 400) return 'PERMANENT_FAILURE';
        
        return 'GENERIC_ERROR';
    }
}
```

### BullMQ Retry Configuration

```javascript
const jobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000
    },
    removeOnComplete: 50,
    removeOnFail: 100
};
```

### Circuit Breaker Pattern

```javascript
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
}
```

## Queue Processing Flow

### 1. Email Ingestion

```javascript
async function addEmailsToQueue(emails, userId, requestId, priority = PRIORITY.NORMAL) {
    const jobData = {
        emails,
        userId,
        requestId,
        timestamp: Date.now()
    };
    
    const jobOptions = {
        priority,
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    };
    
    await emailVerificationQueue.add(JOB_TYPES.CREATE_BATCH, jobData, jobOptions);
}
```

### 2. Batch Creation

```javascript
async function processBatchCreation(emails, userId, requestId) {
    // Check concurrent batch limit
    const activeBatches = await getActiveBatchCount();
    if (activeBatches >= 15) {
        await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            { emails, userId, requestId },
            { delay: 60000 } // Retry in 1 minute
        );
        return { status: 'deferred', reason: 'max_batches_reached' };
    }
    
    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        const nextAvailable = await rateLimiter.getNextAvailableTime();
        const delay = nextAvailable.getTime() - Date.now();
        
        await emailVerificationQueue.add(
            JOB_TYPES.CREATE_BATCH,
            { emails, userId, requestId },
            { delay: Math.max(delay, 0) }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }
    
    // Create optimized batch
    const optimizedBatch = await optimizeBatchComposition(emails);
    const batch = await createBouncerBatch(optimizedBatch, userId, requestId);
    
    // Schedule status check
    await batchStatusQueue.add(
        JOB_TYPES.CHECK_BATCH_STATUS,
        { batchId: batch.id },
        { delay: 30000 } // Check in 30 seconds
    );
    
    return { status: 'created', batchId: batch.id };
}
```

### 3. Status Monitoring

```javascript
async function checkBatchStatus(batchId) {
    const batch = await getBatchInfo(batchId);
    if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
    }
    
    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        await batchStatusQueue.add(
            JOB_TYPES.CHECK_BATCH_STATUS,
            { batchId },
            { delay: 60000 }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }
    
    const status = await getBouncerBatchStatus(batch.batch_id);
    
    if (status.status === 'completed') {
        // Schedule download
        await batchDownloadQueue.add(
            JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
            { batchId },
            { priority: PRIORITY.CRITICAL }
        );
        return { status: 'completed', ready_for_download: true };
    } else if (status.status === 'failed') {
        await handleBatchFailure(batch);
        return { status: 'failed' };
    } else {
        // Still processing, check again later
        await batchStatusQueue.add(
            JOB_TYPES.CHECK_BATCH_STATUS,
            { batchId },
            { delay: 30000 }
        );
        return { status: 'processing' };
    }
}
```

### 4. Result Processing

```javascript
async function downloadBatchResults(batchId) {
    const batch = await getBatchInfo(batchId);
    if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
    }
    
    // Check rate limit
    if (!(await rateLimiter.canMakeApiCall())) {
        await batchDownloadQueue.add(
            JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
            { batchId },
            { delay: 60000 }
        );
        return { status: 'deferred', reason: 'rate_limit' };
    }
    
    const results = await downloadBouncerResults(batch.batch_id);
    
    // Process results in transaction
    await db.transaction(async (trx) => {
        // Update Contacts_Global with latest results
        for (const result of results) {
            await updateContactResult(trx, result);
        }
        
        // Store detailed results
        await storeDetailedResults(trx, batch.id, results);
        
        // Update batch status
        await updateBatchStatus(trx, batch.id, 'completed');
        
        // Update queue items
        await updateQueueItems(trx, batch.id, 'completed');
    });
    
    return { status: 'downloaded', results_count: results.length };
}
```

## V2 Optimizations

### 1. Non-Homogeneous Batch Composition

```javascript
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
    
    return optimizedBatch;
}
```

### 2. Multi-Layer Verification

```javascript
async function processMultiLayerVerification(emails) {
    // First pass: Basic verification
    const basicResults = await processBasicVerification(emails);
    
    // Second pass: Deep catch-all for risky emails
    const riskyEmails = basicResults.filter(result => 
        result.status === 'catch-all' || result.score < 70
    );
    
    if (riskyEmails.length > 0) {
        await processDeepVerification(riskyEmails);
    }
}
```

## Monitoring and Management

### Queue Dashboard

```javascript
class QueueMonitor {
    async getQueueStats() {
        const stats = {};
        
        const queues = [
            emailVerificationQueue,
            batchStatusQueue,
            batchDownloadQueue,
            cleanupQueue
        ];
        
        for (const queue of queues) {
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            stats[queue.name] = {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length
            };
        }
        
        return stats;
    }
    
    async pauseQueue(queueName) {
        const queue = this.getQueueByName(queueName);
        await queue.pause();
    }
    
    async resumeQueue(queueName) {
        const queue = this.getQueueByName(queueName);
        await queue.resume();
    }
    
    async retryFailedJobs(queueName) {
        const queue = this.getQueueByName(queueName);
        const failedJobs = await queue.getFailed();
        
        for (const job of failedJobs) {
            await job.retry();
        }
    }
}
```

### Health Checks

```javascript
async function performHealthCheck() {
    const health = {
        timestamp: new Date(),
        redis: await checkRedisHealth(),
        database: await checkDatabaseHealth(),
        bouncer_api: await checkBouncerApiHealth(),
        queue_stats: await getQueueStats(),
        rate_limit_status: await getRateLimitStatus()
    };
    
    // Store health metrics
    await storeHealthMetrics(health);
    
    return health;
}
```

## Deployment Considerations

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Bouncer API
BOUNCER_API_KEY=your_bouncer_api_key
BOUNCER_API_BASE_URL=https://api.usebouncer.com/v1.1

# Queue Configuration
MAX_CONCURRENT_BATCHES=15
BATCH_SIZE=10000
RATE_LIMIT_PER_MINUTE=180

# Database
DATABASE_URL=mysql://user:password@localhost/database
```

### Process Management

```javascript
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    
    // Close all workers
    await Promise.all([
        emailVerificationWorker.close(),
        batchStatusWorker.close(),
        batchDownloadWorker.close(),
        cleanupWorker.close()
    ]);
    
    // Close Redis connection
    await redis.quit();
    
    process.exit(0);
});
```

## Testing Strategy

### Unit Tests

- Queue job processors
- Rate limiter logic
- Error handling functions
- Batch optimization algorithms

### Integration Tests

- End-to-end email verification flow
- API error simulation
- Rate limit behavior
- Database transaction integrity

### Load Tests

- Concurrent batch processing
- Rate limit adherence under load
- Queue performance with large volumes
- Memory usage patterns

## Security Considerations

- API key management and rotation
- Rate limiting to prevent abuse
- Input validation for email addresses
- Database query parameterization
- Redis security configuration
- Error message sanitization

## Performance Metrics

### Key Metrics to Track

- Queue processing throughput
- API response times
- Error rates by type
- Batch completion rates
- Rate limit utilization
- Memory and CPU usage

### Alerting Thresholds

- Queue backlog > 100,000 items
- Error rate > 5%
- Rate limit utilization > 90%
- API response time > 5 seconds
- Worker failures > 10 per hour

This implementation plan provides a comprehensive, production-ready solution for integrating Bouncer email verification with a robust queue management system using BullMQ.