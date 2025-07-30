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
                host: process.env.CACHE_SERVER_HOSTNAME || 'localhost',
                port: process.env.CACHE_SERVER_PORT || 6379,
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

            console.log('Bouncer Queue Manager initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize Queue Manager:', error);
            return false;
        }
    }

    /**
     * Setup queue event handlers
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

        this.queue.on('active', (job) => {
            console.log(`🏃 Job ${job.name} started:`, job.id, new Date().toISOString());
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
            concurrency: 3,        // Allow parallel processing with new race-free design
            stalledInterval: 30000,
            maxStalledCount: 1
        };

        // Initialize Unified Worker that handles all job types
        const UnifiedWorker = require('./workers/unified_worker');
        const unifiedWorker = new Worker('bouncer-queue', UnifiedWorker.processJob, workerConfig);
        this.workers.push(unifiedWorker);

        // Log worker info
        console.log('🔧 Unified Worker initialized (handles both batch creation and status checking)');

        console.log(`Initialized ${this.workers.length} workers`);
    }

    /**
     * Schedule repeating jobs
     * - Batch Creator - Every 5 seconds for both deliverable and catchall
     * - Individual status checking is now scheduled per-batch by the batch creator
     */
    async scheduleJobs() {
        console.log('Scheduling repeating jobs...');

        // Batch Creator
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

        console.log('Batch creation jobs scheduled successfully');
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
            if (this.queue) await this.queue.close();
            console.log('Queue Manager shut down successfully');
            return true;

        } catch (error) {
            console.error('Error shutting down Queue Manager:', error);
            return false;
        }
    }

    /**
     * Get queue status
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