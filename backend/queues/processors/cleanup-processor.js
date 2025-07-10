import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import knex from '../../knexfile.js';

// Initialize database connection
const db = knex({
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'omniverifier',
        charset: 'utf8mb3'
    }
});

// Redis connection for BullMQ
const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    maxRetriesPerRequest: 3
});

// Job types for cleanup operations
const JOB_TYPES = {
    CLEANUP_RATE_LIMITS: 'cleanup-rate-limits',
    HEALTH_CHECK: 'health-check'
};

// Health check functions
async function checkRedisHealth() {
    try {
        const pong = await redis.ping();
        return {
            status: 'healthy',
            latency: Date.now(),
            info: pong
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

async function checkDatabaseHealth() {
    try {
        await db.raw('SELECT 1');
        return {
            status: 'healthy',
            latency: Date.now()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

async function checkBouncerApiHealth() {
    try {
        const response = await fetch(`${process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1'}/health`, {
            method: 'GET',
            headers: {
                'X-API-KEY': process.env.BOUNCER_API_KEY || ''
            },
            timeout: 5000
        });
        
        return {
            status: response.ok ? 'healthy' : 'unhealthy',
            statusCode: response.status,
            latency: Date.now()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

async function getQueueStats() {
    try {
        const stats = {};
        
        // Get queue statistics from Redis
        const queueNames = ['email-verification', 'batch-status-check', 'batch-download', 'cleanup-tasks'];
        
        for (const queueName of queueNames) {
            const waiting = await redis.llen(`bull:${queueName}:waiting`);
            const active = await redis.llen(`bull:${queueName}:active`);
            const completed = await redis.llen(`bull:${queueName}:completed`);
            const failed = await redis.llen(`bull:${queueName}:failed`);
            
            stats[queueName] = {
                waiting: waiting || 0,
                active: active || 0,
                completed: completed || 0,
                failed: failed || 0
            };
        }
        
        return stats;
    } catch (error) {
        return {
            error: error.message
        };
    }
}

async function getRateLimitStatus() {
    try {
        const now = new Date();
        const windowStart = new Date(now.getTime() - 60000); // 1 minute window
        
        const result = await db('Bouncer_Rate_Limit')
            .where('window_start_ts', '>=', windowStart)
            .count('* as count')
            .first();
        
        const currentCount = result ? result.count : 0;
        const maxRequests = 180; // Conservative limit
        
        return {
            current_requests: currentCount,
            max_requests: maxRequests,
            utilization: (currentCount / maxRequests) * 100,
            window_start: windowStart,
            window_end: now
        };
    } catch (error) {
        return {
            error: error.message
        };
    }
}

async function storeHealthMetrics(health) {
    try {
        const metrics = [
            {
                metric_name: 'redis_status',
                metric_value: health.redis.status === 'healthy' ? 1 : 0,
                recorded_ts: new Date()
            },
            {
                metric_name: 'database_status',
                metric_value: health.database.status === 'healthy' ? 1 : 0,
                recorded_ts: new Date()
            },
            {
                metric_name: 'bouncer_api_status',
                metric_value: health.bouncer_api.status === 'healthy' ? 1 : 0,
                recorded_ts: new Date()
            }
        ];
        
        // Add queue metrics
        if (health.queue_stats && !health.queue_stats.error) {
            for (const [queueName, stats] of Object.entries(health.queue_stats)) {
                metrics.push(
                    {
                        metric_name: `queue_${queueName}_waiting`,
                        metric_value: stats.waiting,
                        recorded_ts: new Date()
                    },
                    {
                        metric_name: `queue_${queueName}_active`,
                        metric_value: stats.active,
                        recorded_ts: new Date()
                    },
                    {
                        metric_name: `queue_${queueName}_failed`,
                        metric_value: stats.failed,
                        recorded_ts: new Date()
                    }
                );
            }
        }
        
        // Add rate limit metrics
        if (health.rate_limit_status && !health.rate_limit_status.error) {
            metrics.push({
                metric_name: 'rate_limit_utilization',
                metric_value: Math.round(health.rate_limit_status.utilization),
                recorded_ts: new Date()
            });
        }
        
        await db('Bouncer_Health_Metrics').insert(metrics);
        
        return metrics.length;
    } catch (error) {
        console.error('Error storing health metrics:', error);
        return 0;
    }
}

// Main health check function
async function performHealthCheck() {
    try {
        const health = {
            timestamp: new Date(),
            redis: await checkRedisHealth(),
            database: await checkDatabaseHealth(),
            bouncer_api: await checkBouncerApiHealth(),
            queue_stats: await getQueueStats(),
            rate_limit_status: await getRateLimitStatus()
        };
        
        // Store health metrics
        const metricsStored = await storeHealthMetrics(health);
        
        console.log(`Health check completed. Stored ${metricsStored} metrics.`);
        
        return {
            status: 'completed',
            metrics_stored: metricsStored,
            overall_health: health
        };
    } catch (error) {
        console.error('Health check failed:', error);
        return {
            status: 'failed',
            error: error.message
        };
    }
}

// Rate limit cleanup function
async function cleanupRateLimits() {
    try {
        const cutoffTime = new Date(Date.now() - 3600000); // 1 hour ago
        
        const deleted = await db('Bouncer_Rate_Limit')
            .where('window_end_ts', '<', cutoffTime)
            .del();
        
        console.log(`Cleaned up ${deleted} old rate limit records`);
        
        return {
            status: 'completed',
            records_deleted: deleted
        };
    } catch (error) {
        console.error('Rate limit cleanup failed:', error);
        return {
            status: 'failed',
            error: error.message
        };
    }
}

// Additional cleanup functions
async function cleanupOldHealthMetrics() {
    try {
        const cutoffTime = new Date(Date.now() - 7 * 24 * 3600000); // 7 days ago
        
        const deleted = await db('Bouncer_Health_Metrics')
            .where('recorded_ts', '<', cutoffTime)
            .del();
        
        console.log(`Cleaned up ${deleted} old health metrics`);
        
        return {
            status: 'completed',
            records_deleted: deleted
        };
    } catch (error) {
        console.error('Health metrics cleanup failed:', error);
        return {
            status: 'failed',
            error: error.message
        };
    }
}

async function cleanupCompletedBatches() {
    try {
        const cutoffTime = new Date(Date.now() - 30 * 24 * 3600000); // 30 days ago
        
        const deleted = await db('Bouncer_Batches')
            .where('status', 'completed')
            .where('completed_ts', '<', cutoffTime)
            .del();
        
        console.log(`Cleaned up ${deleted} old completed batches`);
        
        return {
            status: 'completed',
            records_deleted: deleted
        };
    } catch (error) {
        console.error('Batch cleanup failed:', error);
        return {
            status: 'failed',
            error: error.message
        };
    }
}

// Main cleanup processor function
async function processCleanupJob(job) {
    const { jobType, ...jobData } = job.data;
    
    try {
        switch (jobType) {
            case JOB_TYPES.CLEANUP_RATE_LIMITS:
                // Perform multiple cleanup tasks
                const rateLimitResult = await cleanupRateLimits();
                const healthMetricsResult = await cleanupOldHealthMetrics();
                const batchesResult = await cleanupCompletedBatches();
                
                return {
                    status: 'completed',
                    results: {
                        rate_limits: rateLimitResult,
                        health_metrics: healthMetricsResult,
                        batches: batchesResult
                    }
                };
                
            case JOB_TYPES.HEALTH_CHECK:
                return await performHealthCheck();
                
            default:
                throw new Error(`Unknown cleanup job type: ${jobType}`);
        }
    } catch (error) {
        console.error('Cleanup job failed:', error);
        throw error;
    }
}

// Create cleanup worker
const cleanupWorker = new Worker(
    'cleanup-tasks',
    async (job) => {
        console.log(`Processing cleanup job: ${job.name} (ID: ${job.id})`);
        
        const startTime = Date.now();
        const result = await processCleanupJob(job);
        const processingTime = Date.now() - startTime;
        
        console.log(`Cleanup job completed in ${processingTime}ms:`, result);
        
        return result;
    },
    {
        connection: redis,
        concurrency: 1, // Single cleanup worker as specified
        limiter: {
            max: 5,      // Max 5 cleanup jobs per duration
            duration: 60000 // 1 minute
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 25     // Keep last 25 failed jobs
    }
);

// Error handling
cleanupWorker.on('error', (error) => {
    console.error('Cleanup worker error:', error);
});

cleanupWorker.on('failed', (job, error) => {
    console.error(`Cleanup job ${job.id} failed:`, error);
});

cleanupWorker.on('completed', (job, result) => {
    console.log(`Cleanup job ${job.id} completed:`, result);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down cleanup worker...');
    await cleanupWorker.close();
    await redis.quit();
    await db.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down cleanup worker...');
    await cleanupWorker.close();
    await redis.quit();
    await db.destroy();
    process.exit(0);
});

// Schedule recurring cleanup and health check jobs
const { Queue } = await import('bullmq');
const cleanupQueue = new Queue('cleanup-tasks', { connection: redis });

// Schedule cleanup job every 4 hours
await cleanupQueue.add(
    JOB_TYPES.CLEANUP_RATE_LIMITS,
    { jobType: JOB_TYPES.CLEANUP_RATE_LIMITS },
    {
        repeat: {
            pattern: '0 */4 * * *' // Every 4 hours
        },
        removeOnComplete: 5,
        removeOnFail: 10
    }
);

// Schedule health check every 5 minutes
await cleanupQueue.add(
    JOB_TYPES.HEALTH_CHECK,
    { jobType: JOB_TYPES.HEALTH_CHECK },
    {
        repeat: {
            pattern: '*/5 * * * *' // Every 5 minutes
        },
        removeOnComplete: 20,
        removeOnFail: 20
    }
);

console.log('Cleanup processor started with scheduled jobs:');
console.log('- Rate limit cleanup: Every 4 hours');
console.log('- Health checks: Every 5 minutes');

export default cleanupWorker;
export { JOB_TYPES, performHealthCheck, cleanupRateLimits };