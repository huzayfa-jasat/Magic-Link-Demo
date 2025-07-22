// Dependencies
const { Queue, Worker } = require('bullmq');

class QueueManager {
    constructor() {
        this.queue = null;
        this.workers = [];
        this.redisConnection = null;
        this.isShuttingDown = false;
    }

    /**
     * Initialize queue system with Redis connection and job scheduling
     */
    async initialize() {
        try {
            console.log('Initializing Bouncer Queue Manager...');

            // Setup Redis connection
            this.redisConnection = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                // Use REDIS_URL if provided
                ...(process.env.REDIS_URL && { url: process.env.REDIS_URL })
            };

            // Create main queue with simplified configuration
            this.queue = new Queue('bouncer-queue', {
                connection: this.redisConnection,
                defaultJobOptions: {
                    removeOnComplete: 10,  // Keep minimal completed jobs
                    removeOnFail: 10,      // Keep minimal failed jobs
                    attempts: 1,           // NO retries per requirements
                }
            });

            // Setup queue event handlers
            this.setupQueueEvents();

            // Initialize workers
            await this.initializeWorkers();

            // Schedule repeating jobs
            await this.scheduleJobs();

            // Setup graceful shutdown handlers
            this.setupGracefulShutdown();

            console.log('Bouncer Queue Manager initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize Queue Manager:', error);
            return false;
        }
    }

    /**
     * Setup queue event handlers for monitoring
     */
    setupQueueEvents() {
        this.queue.on('completed', (job) => {
            console.log(`✅ Job ${job.name} completed:`, job.id);
        });

        this.queue.on('failed', (job, err) => {
            console.log(`❌ Job ${job.name} failed:`, job.id, err.message);
        });

        this.queue.on('stalled', (job) => {
            console.log(`⏳ Job ${job.name} stalled:`, job.id);
        });

        this.queue.on('error', (error) => {
            console.error('Queue error:', error);
        });
    }

    /**
     * Initialize workers with single-threaded configuration
     */
    async initializeWorkers() {
        console.log('Initializing queue workers...');

        const workerConfig = {
            connection: this.redisConnection,
            concurrency: 1,        // Simple single-threaded processing
            stalledInterval: 30000,
            maxStalledCount: 1
        };

        // Initialize Batch Creator Worker
        const BatchCreatorWorker = require('./workers/batch_creator_worker');
        const batchWorker = new Worker('bouncer-queue', BatchCreatorWorker.processJob, workerConfig);
        this.workers.push(batchWorker);

        // Initialize Status Checker Worker  
        const StatusCheckerWorker = require('./workers/status_checker_worker');
        const statusWorker = new Worker('bouncer-queue', StatusCheckerWorker.processJob, workerConfig);
        this.workers.push(statusWorker);

        console.log(`Initialized ${this.workers.length} workers`);
    }

    /**
     * Schedule repeating jobs as defined in implementation plan
     */
    async scheduleJobs() {
        console.log('Scheduling repeating jobs...');

        // Batch Creator - Every 5 seconds for both deliverable and catchall
        await this.queue.add('greedy_batch_creator_deliverable', 
            { check_type: 'deliverable' }, 
            {
                repeat: { every: 5000 }, // 5 seconds
                jobId: 'batch_creator_deliverable' // Prevent duplicates
            }
        );

        await this.queue.add('greedy_batch_creator_catchall', 
            { check_type: 'catchall' }, 
            {
                repeat: { every: 5000 },
                jobId: 'batch_creator_catchall'
            }
        );

        // Status Checker - Every 30 seconds for both types
        await this.queue.add('status_checker_deliverable', 
            { check_type: 'deliverable' }, 
            {
                repeat: { every: 30000 }, // 30 seconds
                jobId: 'status_checker_deliverable'
            }
        );

        await this.queue.add('status_checker_catchall', 
            { check_type: 'catchall' }, 
            {
                repeat: { every: 30000 },
                jobId: 'status_checker_catchall'
            }
        );

        console.log('All repeating jobs scheduled successfully');
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            console.log(`\nReceived ${signal}. Gracefully shutting down queue system...`);

            try {
                // Close all workers gracefully
                await Promise.all(this.workers.map(worker => worker.close()));
                console.log('All workers closed');

                // Close queue
                if (this.queue) {
                    await this.queue.close();
                    console.log('Queue closed');
                }

                console.log('Queue Manager shutdown complete');
                process.exit(0);

            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    /**
     * Shutdown method for programmatic shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        try {
            // Close all workers
            await Promise.all(this.workers.map(worker => worker.close()));
            
            // Close queue
            if (this.queue) {
                await this.queue.close();
            }

            console.log('Queue Manager shut down successfully');
            return true;

        } catch (error) {
            console.error('Error shutting down Queue Manager:', error);
            return false;
        }
    }

    /**
     * Get queue status for monitoring
     */
    async getStatus() {
        if (!this.queue) return null;

        try {
            const waiting = await this.queue.getWaiting();
            const active = await this.queue.getActive();
            const completed = await this.queue.getCompleted();
            const failed = await this.queue.getFailed();

            return {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length,
                workers: this.workers.length
            };

        } catch (error) {
            console.error('Error getting queue status:', error);
            return null;
        }
    }
}

// Export singleton instance
const queueManager = new QueueManager();
module.exports = queueManager;