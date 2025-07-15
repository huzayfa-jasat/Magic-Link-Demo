const { emailVerificationProcessor } = require('./processors/email-verification-processor');
const { 
    emailVerificationQueue, 
    batchStatusQueue, 
    batchDownloadQueue, 
    cleanupQueue,
    JOB_TYPES,
    PRIORITY,
    defaultJobOptions
} = require('./queue-config');

class QueueManager {
    constructor() {
        this.processors = new Map();
        this.isRunning = false;
        this.healthCheckInterval = null;
    }

    async start() {
        if (this.isRunning) {
            console.log('Queue Manager is already running');
            return;
        }

        console.log('Starting Queue Manager...');

        try {
            // Start email verification processor
            await emailVerificationProcessor.start();
            this.processors.set('email-verification', emailVerificationProcessor);

            // Start health check monitoring
            this.startHealthCheckMonitoring();

            // Schedule initial cleanup
            await this.scheduleCleanupTasks();

            this.isRunning = true;
            console.log('Queue Manager started successfully');

        } catch (error) {
            console.error('Error starting Queue Manager:', error);
            await this.stop();
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            console.log('Queue Manager is not running');
            return;
        }

        console.log('Stopping Queue Manager...');

        try {
            // Stop health check monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            // Stop all processors
            for (const [name, processor] of this.processors) {
                console.log(`Stopping ${name} processor...`);
                await processor.stop();
            }

            this.processors.clear();
            this.isRunning = false;
            console.log('Queue Manager stopped successfully');

        } catch (error) {
            console.error('Error stopping Queue Manager:', error);
            throw error;
        }
    }

    async addEmailsToQueue(emails, userId, requestId, options = {}) {
        const {
            priority = PRIORITY.NORMAL,
            delay = 0,
            batchSize = 10000
        } = options;

        console.log(`Adding ${emails.length} emails to queue for user ${userId}, request ${requestId}`);

        // Split emails into batches if needed
        const batches = [];
        for (let i = 0; i < emails.length; i += batchSize) {
            batches.push(emails.slice(i, i + batchSize));
        }

        const jobPromises = batches.map((batch, index) => {
            const jobData = {
                emails: batch,
                userId,
                requestId,
                batchNumber: index + 1,
                totalBatches: batches.length,
                timestamp: Date.now()
            };

            const jobOptions = {
                ...defaultJobOptions,
                priority,
                delay: delay + (index * 1000) // Stagger batch processing
            };

            return emailVerificationQueue.add(JOB_TYPES.CREATE_BATCH, jobData, jobOptions);
        });

        const jobs = await Promise.all(jobPromises);
        
        console.log(`Successfully queued ${jobs.length} batch creation jobs`);
        
        return {
            jobIds: jobs.map(job => job.id),
            batchCount: batches.length,
            totalEmails: emails.length
        };
    }

    async retryFailedBatch(batchId, userId, requestId, originalEmails) {
        console.log(`Retrying failed batch ${batchId}`);

        const jobData = {
            batchId,
            userId,
            requestId,
            originalEmails,
            timestamp: Date.now()
        };

        const jobOptions = {
            ...defaultJobOptions,
            priority: PRIORITY.HIGH
        };

        const job = await emailVerificationQueue.add(JOB_TYPES.RETRY_FAILED_BATCH, jobData, jobOptions);
        
        return {
            jobId: job.id,
            batchId
        };
    }

    async getQueueStats() {
        const stats = {};

        const queues = [
            { name: 'email-verification', queue: emailVerificationQueue },
            { name: 'batch-status-check', queue: batchStatusQueue },
            { name: 'batch-download', queue: batchDownloadQueue },
            { name: 'cleanup-tasks', queue: cleanupQueue }
        ];

        for (const { name, queue } of queues) {
            try {
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed()
                ]);

                stats[name] = {
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    total: waiting.length + active.length + completed.length + failed.length
                };
            } catch (error) {
                console.error(`Error getting stats for queue ${name}:`, error);
                stats[name] = {
                    waiting: 0,
                    active: 0,
                    completed: 0,
                    failed: 0,
                    total: 0,
                    error: error.message
                };
            }
        }

        return stats;
    }

    async pauseQueue(queueName) {
        const queue = this.getQueueByName(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.pause();
        console.log(`Queue ${queueName} paused`);
    }

    async resumeQueue(queueName) {
        const queue = this.getQueueByName(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.resume();
        console.log(`Queue ${queueName} resumed`);
    }

    async retryFailedJobs(queueName) {
        const queue = this.getQueueByName(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const failedJobs = await queue.getFailed();
        console.log(`Retrying ${failedJobs.length} failed jobs in queue ${queueName}`);

        const retryPromises = failedJobs.map(job => job.retry());
        await Promise.all(retryPromises);

        console.log(`Successfully retried ${failedJobs.length} jobs`);
        
        return failedJobs.length;
    }

    async cleanFailedJobs(queueName, olderThanHours = 24) {
        const queue = this.getQueueByName(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const failedJobs = await queue.getFailed();
        const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
        
        let cleanedCount = 0;
        for (const job of failedJobs) {
            if (job.timestamp < cutoffTime) {
                await job.remove();
                cleanedCount++;
            }
        }

        console.log(`Cleaned ${cleanedCount} failed jobs from queue ${queueName}`);
        
        return cleanedCount;
    }

    getQueueByName(queueName) {
        switch (queueName) {
            case 'email-verification':
                return emailVerificationQueue;
            case 'batch-status-check':
                return batchStatusQueue;
            case 'batch-download':
                return batchDownloadQueue;
            case 'cleanup-tasks':
                return cleanupQueue;
            default:
                return null;
        }
    }

    async scheduleCleanupTasks() {
        console.log('Scheduling cleanup tasks...');

        // Schedule rate limit cleanup every 5 minutes
        await cleanupQueue.add(
            JOB_TYPES.CLEANUP_RATE_LIMITS,
            {},
            {
                repeat: { 
                    pattern: '*/5 * * * *' // Every 5 minutes
                },
                removeOnComplete: 10,
                removeOnFail: 5
            }
        );

        // Schedule health check every minute
        await cleanupQueue.add(
            JOB_TYPES.HEALTH_CHECK,
            {},
            {
                repeat: { 
                    pattern: '* * * * *' // Every minute
                },
                removeOnComplete: 60,
                removeOnFail: 10
            }
        );

        console.log('Cleanup tasks scheduled');
    }

    startHealthCheckMonitoring() {
        // Monitor queue health every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            try {
                const stats = await this.getQueueStats();
                
                // Check for concerning conditions
                for (const [queueName, queueStats] of Object.entries(stats)) {
                    if (queueStats.failed > 50) {
                        console.warn(`Queue ${queueName} has ${queueStats.failed} failed jobs`);
                    }
                    
                    if (queueStats.waiting > 1000) {
                        console.warn(`Queue ${queueName} has ${queueStats.waiting} waiting jobs`);
                    }
                }
            } catch (error) {
                console.error('Error in health check monitoring:', error);
            }
        }, 30000);
    }

    async getHealthStatus() {
        const stats = await this.getQueueStats();
        const now = new Date();

        return {
            timestamp: now.toISOString(),
            isRunning: this.isRunning,
            activeProcessors: Array.from(this.processors.keys()),
            queueStats: stats,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            version: process.version
        };
    }
}

// Create singleton instance
const queueManager = new QueueManager();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    
    try {
        await queueManager.stop();
        console.log('Queue Manager stopped successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    
    try {
        await queueManager.stop();
        console.log('Queue Manager stopped successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

module.exports = {
    QueueManager,
    queueManager
};