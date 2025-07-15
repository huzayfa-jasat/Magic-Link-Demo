/**
 * Queue Manager Service for Bouncer Email Verification
 * 
 * Main orchestration service that ties together all queue operations and services.
 * Handles:
 * - Queue initialization and management
 * - Worker lifecycle management
 * - Email verification request processing
 * - Status monitoring and reporting
 * - Graceful startup and shutdown
 * 
 * Features:
 * - Full orchestration of all queue operations
 * - Production-ready error handling and logging
 * - Rate limiting and circuit breaker integration
 * - Health monitoring and metrics
 * - Graceful shutdown handling
 */

const { Worker, Queue, QueueScheduler } = require('bullmq');
const IORedis = require('ioredis');
const knex = require('knex');
const EventEmitter = require('events');

// Import existing services
const BouncerApiService = require('./bouncer-api');
const RateLimiter = require('./rate-limiter');
const { CircuitBreaker } = require('./circuit-breaker');

// Import queue configuration
const {
    JOB_TYPES,
    PRIORITY,
    defaultJobOptions
} = require('../queues/queue-config');

// Database configuration
const config = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);


/**
 * QueueManager Class - Main orchestration service
 */
class QueueManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.config = {
            maxConcurrentBatches: options.maxConcurrentBatches || 15,
            batchSize: options.batchSize || 10000,
            rateLimitPerMinute: options.rateLimitPerMinute || 180,
            healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
            cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
            ...options
        };
        
        // State management
        this.isInitialized = false;
        this.isRunning = false;
        this.workers = new Map();
        this.queues = new Map();
        this.schedulers = new Map();
        
        // Services
        this.bouncerApi = new BouncerApiService();
        this.rateLimiter = new RateLimiter();
        this.circuitBreaker = CircuitBreaker.createForBouncerApi({
            onStateChange: (data) => this.emit('circuitBreakerStateChange', data),
            onFailure: (data) => this.emit('circuitBreakerFailure', data)
        });
        
        // Redis connection
        this.redis = null;
        
        // Health monitoring
        this.lastHealthCheck = null;
        this.healthCheckTimer = null;
        this.cleanupTimer = null;
        
        // Statistics
        this.stats = {
            totalJobsProcessed: 0,
            totalJobsFailed: 0,
            activeJobs: 0,
            lastStartTime: null,
            uptime: 0
        };
        
        // Logging
        this.logger = options.logger || console;
        
        // Bind methods
        this.handleWorkerError = this.handleWorkerError.bind(this);
        this.handleWorkerCompleted = this.handleWorkerCompleted.bind(this);
        this.handleWorkerFailed = this.handleWorkerFailed.bind(this);
        this.gracefulShutdown = this.gracefulShutdown.bind(this);
        
        // Setup graceful shutdown
        process.on('SIGINT', this.gracefulShutdown);
        process.on('SIGTERM', this.gracefulShutdown);
    }

    /**
     * Initialize all queues and dependencies
     */
    async initializeQueues() {
        if (this.isInitialized) {
            this.logger.warn('QueueManager already initialized');
            return;
        }

        try {
            this.logger.info('Initializing QueueManager...');
            
            // Initialize Redis connection
            await this.initializeRedis();
            
            // Initialize queues
            await this.initializeQueueInstances();
            
            // Initialize schedulers
            await this.initializeSchedulers();
            
            // Test database connection
            await this.testDatabaseConnection();
            
            // Test Bouncer API connection
            await this.testBouncerApiConnection();
            
            this.isInitialized = true;
            this.logger.info('QueueManager initialized successfully');
            this.emit('initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize QueueManager:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        this.redis = new IORedis({
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

        // Test Redis connection
        await this.redis.ping();
        this.logger.info('Redis connection established');
    }

    /**
     * Initialize all queue instances
     */
    async initializeQueueInstances() {
        const queueNames = [
            'email-verification',
            'batch-status-check',
            'batch-download',
            'cleanup-tasks'
        ];

        for (const queueName of queueNames) {
            const queue = new Queue(queueName, { connection: this.redis });
            this.queues.set(queueName, queue);
            this.logger.info(`Queue '${queueName}' initialized`);
        }
    }

    /**
     * Initialize queue schedulers
     */
    async initializeSchedulers() {
        for (const [queueName, queue] of this.queues.entries()) {
            const scheduler = new QueueScheduler(queueName, { connection: this.redis });
            this.schedulers.set(queueName, scheduler);
            this.logger.info(`Scheduler for '${queueName}' initialized`);
        }
    }

    /**
     * Test database connection
     */
    async testDatabaseConnection() {
        try {
            await db.raw('SELECT 1');
            this.logger.info('Database connection verified');
        } catch (error) {
            this.logger.error('Database connection failed:', error);
            throw new Error('Database connection failed');
        }
    }

    /**
     * Test Bouncer API connection
     */
    async testBouncerApiConnection() {
        try {
            // This would be a simple health check endpoint if available
            // For now, we'll just verify the API key is configured
            if (!process.env.BOUNCER_API_KEY) {
                throw new Error('BOUNCER_API_KEY not configured');
            }
            this.logger.info('Bouncer API configuration verified');
        } catch (error) {
            this.logger.error('Bouncer API connection test failed:', error);
            throw error;
        }
    }

    /**
     * Start all workers
     */
    async startWorkers() {
        if (!this.isInitialized) {
            throw new Error('QueueManager must be initialized before starting workers');
        }

        if (this.isRunning) {
            this.logger.warn('Workers already running');
            return;
        }

        try {
            this.logger.info('Starting queue workers...');
            
            // Start email verification worker
            await this.startEmailVerificationWorker();
            
            // Start batch status worker
            await this.startBatchStatusWorker();
            
            // Start batch download worker
            await this.startBatchDownloadWorker();
            
            // Start cleanup worker
            await this.startCleanupWorker();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            // Start periodic cleanup
            this.startPeriodicCleanup();
            
            this.isRunning = true;
            this.stats.lastStartTime = new Date();
            this.logger.info('All workers started successfully');
            this.emit('workersStarted');
            
        } catch (error) {
            this.logger.error('Failed to start workers:', error);
            await this.stopWorkers();
            throw error;
        }
    }

    /**
     * Start email verification worker
     */
    async startEmailVerificationWorker() {
        const worker = new Worker(
            'email-verification',
            async (job) => {
                this.stats.activeJobs++;
                try {
                    return await this.processEmailVerificationJob(job);
                } finally {
                    this.stats.activeJobs--;
                }
            },
            {
                connection: this.redis,
                concurrency: 5,
                limiter: {
                    max: 10,
                    duration: 60000
                },
                ...defaultJobOptions
            }
        );

        this.setupWorkerEventHandlers(worker, 'email-verification');
        this.workers.set('email-verification', worker);
        this.logger.info('Email verification worker started');
    }

    /**
     * Start batch status worker
     */
    async startBatchStatusWorker() {
        const worker = new Worker(
            'batch-status-check',
            async (job) => {
                this.stats.activeJobs++;
                try {
                    return await this.processBatchStatusJob(job);
                } finally {
                    this.stats.activeJobs--;
                }
            },
            {
                connection: this.redis,
                concurrency: 10,
                limiter: {
                    max: 50,
                    duration: 60000
                },
                ...defaultJobOptions
            }
        );

        this.setupWorkerEventHandlers(worker, 'batch-status-check');
        this.workers.set('batch-status-check', worker);
        this.logger.info('Batch status worker started');
    }

    /**
     * Start batch download worker
     */
    async startBatchDownloadWorker() {
        const worker = new Worker(
            'batch-download',
            async (job) => {
                this.stats.activeJobs++;
                try {
                    return await this.processBatchDownloadJob(job);
                } finally {
                    this.stats.activeJobs--;
                }
            },
            {
                connection: this.redis,
                concurrency: 3,
                limiter: {
                    max: 20,
                    duration: 60000
                },
                ...defaultJobOptions
            }
        );

        this.setupWorkerEventHandlers(worker, 'batch-download');
        this.workers.set('batch-download', worker);
        this.logger.info('Batch download worker started');
    }

    /**
     * Start cleanup worker
     */
    async startCleanupWorker() {
        const worker = new Worker(
            'cleanup-tasks',
            async (job) => {
                this.stats.activeJobs++;
                try {
                    return await this.processCleanupJob(job);
                } finally {
                    this.stats.activeJobs--;
                }
            },
            {
                connection: this.redis,
                concurrency: 1,
                ...defaultJobOptions
            }
        );

        this.setupWorkerEventHandlers(worker, 'cleanup-tasks');
        this.workers.set('cleanup-tasks', worker);
        this.logger.info('Cleanup worker started');
    }

    /**
     * Setup worker event handlers
     */
    setupWorkerEventHandlers(worker, workerName) {
        worker.on('completed', (job, result) => {
            this.handleWorkerCompleted(workerName, job, result);
        });

        worker.on('failed', (job, err) => {
            this.handleWorkerFailed(workerName, job, err);
        });

        worker.on('error', (err) => {
            this.handleWorkerError(workerName, err);
        });
    }

    /**
     * Process email verification job
     */
    async processEmailVerificationJob(job) {
        const { emails, userId, requestId } = job.data;
        
        switch (job.name) {
            case JOB_TYPES.CREATE_BATCH:
                return await this.processBatchCreation(emails, userId, requestId);
            case JOB_TYPES.RETRY_FAILED_BATCH:
                return await this.retryFailedBatch(job.data.batchId);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    }

    /**
     * Process batch creation
     */
    async processBatchCreation(emails, userId, requestId) {
        try {
            // Check concurrent batch limit
            const activeBatches = await this.getActiveBatchCount();
            if (activeBatches >= this.config.maxConcurrentBatches) {
                // Re-queue with delay
                await this.addDelayedJob('email-verification', JOB_TYPES.CREATE_BATCH, 
                    { emails, userId, requestId }, 60000);
                return { status: 'deferred', reason: 'max_batches_reached' };
            }

            // Check rate limit
            if (!(await this.rateLimiter.canMakeApiCall())) {
                const nextAvailable = await this.rateLimiter.getNextAvailableTime();
                const delay = nextAvailable.getTime() - Date.now();
                
                await this.addDelayedJob('email-verification', JOB_TYPES.CREATE_BATCH,
                    { emails, userId, requestId }, Math.max(delay, 0));
                return { status: 'deferred', reason: 'rate_limit' };
            }

            // Create optimized batch
            const optimizedBatch = await this.optimizeBatchComposition(emails);
            
            // Create batch through circuit breaker
            const batch = await this.circuitBreaker.executeApiCall(
                async () => {
                    await this.rateLimiter.recordApiCall();
                    return await this.bouncerApi.createBatch(optimizedBatch, userId, requestId);
                }
            );

            // Schedule status check
            await this.addDelayedJob('batch-status-check', JOB_TYPES.CHECK_BATCH_STATUS,
                { batchId: batch.id }, 30000);

            return { status: 'created', batchId: batch.id };
            
        } catch (error) {
            this.logger.error('Batch creation failed:', error);
            throw error;
        }
    }

    /**
     * Process batch status job
     */
    async processBatchStatusJob(job) {
        const { batchId } = job.data;
        
        try {
            const batch = await this.getBatchInfo(batchId);
            if (!batch) {
                throw new Error(`Batch ${batchId} not found`);
            }

            // Check rate limit
            if (!(await this.rateLimiter.canMakeApiCall())) {
                await this.addDelayedJob('batch-status-check', JOB_TYPES.CHECK_BATCH_STATUS,
                    { batchId }, 60000);
                return { status: 'deferred', reason: 'rate_limit' };
            }

            // Check status through circuit breaker
            const status = await this.circuitBreaker.executeApiCall(
                async () => {
                    await this.rateLimiter.recordApiCall();
                    return await this.bouncerApi.getBatchStatus(batch.batch_id);
                }
            );

            if (status.status === 'completed') {
                // Schedule download
                await this.addJob('batch-download', JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
                    { batchId }, { priority: PRIORITY.CRITICAL });
                return { status: 'completed', ready_for_download: true };
            } else if (status.status === 'failed') {
                await this.handleBatchFailure(batch);
                return { status: 'failed' };
            } else {
                // Still processing, check again later
                await this.addDelayedJob('batch-status-check', JOB_TYPES.CHECK_BATCH_STATUS,
                    { batchId }, 30000);
                return { status: 'processing' };
            }
            
        } catch (error) {
            this.logger.error(`Batch status check failed for batch ${batchId}:`, error);
            throw error;
        }
    }

    /**
     * Process batch download job
     */
    async processBatchDownloadJob(job) {
        const { batchId } = job.data;
        
        try {
            const batch = await this.getBatchInfo(batchId);
            if (!batch) {
                throw new Error(`Batch ${batchId} not found`);
            }

            // Check rate limit
            if (!(await this.rateLimiter.canMakeApiCall())) {
                await this.addDelayedJob('batch-download', JOB_TYPES.DOWNLOAD_BATCH_RESULTS,
                    { batchId }, 60000);
                return { status: 'deferred', reason: 'rate_limit' };
            }

            // Download results through circuit breaker
            const results = await this.circuitBreaker.executeApiCall(
                async () => {
                    await this.rateLimiter.recordApiCall();
                    return await this.bouncerApi.downloadBatchResults(batch.batch_id);
                }
            );

            // Process results in transaction
            await this.processDownloadedResults(batch, results);

            return { status: 'downloaded', results_count: results.length };
            
        } catch (error) {
            this.logger.error(`Batch download failed for batch ${batchId}:`, error);
            throw error;
        }
    }

    /**
     * Process cleanup job
     */
    async processCleanupJob(job) {
        switch (job.name) {
            case JOB_TYPES.CLEANUP_RATE_LIMITS:
                return await this.rateLimiter.cleanup();
            case JOB_TYPES.HEALTH_CHECK:
                return await this.performHealthCheck();
            default:
                throw new Error(`Unknown cleanup job type: ${job.name}`);
        }
    }

    /**
     * Add email verification request to queue
     */
    async addEmailVerificationRequest(emails, userId, requestId, options = {}) {
        if (!this.isInitialized) {
            throw new Error('QueueManager not initialized');
        }

        try {
            const priority = options.priority || PRIORITY.NORMAL;
            const jobData = {
                emails,
                userId,
                requestId,
                timestamp: Date.now()
            };

            const jobOptions = {
                priority,
                ...defaultJobOptions,
                ...options
            };

            const job = await this.addJob('email-verification', JOB_TYPES.CREATE_BATCH, 
                jobData, jobOptions);

            this.logger.info(`Email verification request added to queue: ${job.id}`);
            this.emit('emailVerificationRequestAdded', { jobId: job.id, userId, requestId });
            
            return {
                jobId: job.id,
                queueName: 'email-verification',
                status: 'queued',
                estimatedProcessingTime: await this.getEstimatedProcessingTime()
            };
            
        } catch (error) {
            this.logger.error('Failed to add email verification request:', error);
            throw error;
        }
    }

    /**
     * Get processing status for a request
     */
    async getProcessingStatus(requestId) {
        try {
            // Get batch information
            const batches = await db('Bouncer_Batches')
                .select('*')
                .where('request_id', requestId)
                .orderBy('created_ts', 'desc');

            if (batches.length === 0) {
                return { status: 'not_found', message: 'No batches found for this request' };
            }

            // Get queue status
            const queueStatus = await this.getQueueStats();

            // Calculate overall progress
            const totalEmails = batches.reduce((sum, batch) => sum + batch.quantity, 0);
            const completedEmails = batches
                .filter(batch => batch.status === 'completed')
                .reduce((sum, batch) => sum + batch.quantity, 0);
            
            const progress = totalEmails > 0 ? (completedEmails / totalEmails) * 100 : 0;

            return {
                status: 'processing',
                requestId,
                batches: batches.map(batch => ({
                    batchId: batch.id,
                    status: batch.status,
                    quantity: batch.quantity,
                    created: batch.created_ts,
                    updated: batch.updated_ts,
                    completed: batch.completed_ts,
                    error: batch.error_message
                })),
                progress: Math.round(progress),
                totalEmails,
                completedEmails,
                queueStatus,
                estimatedTimeRemaining: await this.getEstimatedTimeRemaining(requestId)
            };
            
        } catch (error) {
            this.logger.error(`Failed to get processing status for request ${requestId}:`, error);
            throw error;
        }
    }

    /**
     * Stop all workers
     */
    async stopWorkers() {
        if (!this.isRunning) {
            this.logger.warn('Workers not running');
            return;
        }

        try {
            this.logger.info('Stopping queue workers...');
            
            // Stop health monitoring
            this.stopHealthMonitoring();
            
            // Stop periodic cleanup
            this.stopPeriodicCleanup();
            
            // Close all workers
            const workerPromises = [];
            for (const [name, worker] of this.workers.entries()) {
                this.logger.info(`Closing worker: ${name}`);
                workerPromises.push(worker.close());
            }
            
            await Promise.all(workerPromises);
            this.workers.clear();
            
            // Close schedulers
            const schedulerPromises = [];
            for (const [name, scheduler] of this.schedulers.entries()) {
                this.logger.info(`Closing scheduler: ${name}`);
                schedulerPromises.push(scheduler.close());
            }
            
            await Promise.all(schedulerPromises);
            this.schedulers.clear();
            
            this.isRunning = false;
            this.logger.info('All workers stopped');
            this.emit('workersStopped');
            
        } catch (error) {
            this.logger.error('Error stopping workers:', error);
            throw error;
        }
    }

    /**
     * Get queue statistics
     */
    async getQueueStats() {
        const stats = {};
        
        try {
            for (const [name, queue] of this.queues.entries()) {
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
            }
            
            return stats;
        } catch (error) {
            this.logger.error('Failed to get queue stats:', error);
            return {};
        }
    }

    /**
     * Get system health status
     */
    async getHealthStatus() {
        try {
            const health = {
                timestamp: new Date(),
                uptime: this.getUptime(),
                isRunning: this.isRunning,
                isInitialized: this.isInitialized,
                redis: await this.checkRedisHealth(),
                database: await this.checkDatabaseHealth(),
                bouncerApi: await this.checkBouncerApiHealth(),
                circuitBreaker: this.circuitBreaker.getStats(),
                queueStats: await this.getQueueStats(),
                rateLimitStatus: await this.getRateLimitStatus(),
                systemStats: this.getSystemStats()
            };
            
            return health;
        } catch (error) {
            this.logger.error('Failed to get health status:', error);
            return {
                timestamp: new Date(),
                error: error.message,
                status: 'unhealthy'
            };
        }
    }

    /**
     * Graceful shutdown
     */
    async gracefulShutdown() {
        this.logger.info('Initiating graceful shutdown...');
        
        try {
            // Stop accepting new jobs
            await this.stopWorkers();
            
            // Close Redis connection
            if (this.redis) {
                await this.redis.quit();
                this.logger.info('Redis connection closed');
            }
            
            // Close database connection
            await db.destroy();
            this.logger.info('Database connection closed');
            
            this.logger.info('Graceful shutdown completed');
            this.emit('shutdown');
            
        } catch (error) {
            this.logger.error('Error during graceful shutdown:', error);
            this.emit('shutdownError', error);
        }
        
        process.exit(0);
    }

    // Helper methods
    async addJob(queueName, jobType, data, options = {}) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        
        return await queue.add(jobType, data, options);
    }

    async addDelayedJob(queueName, jobType, data, delay) {
        return await this.addJob(queueName, jobType, data, { delay });
    }

    async getActiveBatchCount() {
        const result = await db('Bouncer_Batches')
            .whereIn('status', ['queued', 'processing', 'downloading'])
            .count('* as count')
            .first();
        
        return result.count;
    }

    async getBatchInfo(batchId) {
        return await db('Bouncer_Batches')
            .select('*')
            .where('id', batchId)
            .first();
    }

    async optimizeBatchComposition(emails) {
        // Group by domain for better performance
        const domainGroups = {};
        
        emails.forEach(email => {
            const domain = email.email ? email.email.split('@')[1] : email.split('@')[1];
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

    async processDownloadedResults(batch, results) {
        return await db.transaction(async (trx) => {
            // Update Contacts_Global with latest results
            for (const result of results) {
                await trx('Contacts_Global')
                    .where('global_id', result.global_id)
                    .update({
                        status: result.status,
                        result: result.result,
                        reason: result.reason,
                        updated_ts: new Date()
                    });
            }
            
            // Store detailed results
            const detailedResults = results.map(result => ({
                batch_id: batch.id,
                global_id: result.global_id,
                bouncer_status: result.status,
                bouncer_reason: result.reason,
                domain_info: result.domain_info ? JSON.stringify(result.domain_info) : null,
                account_info: result.account_info ? JSON.stringify(result.account_info) : null,
                dns_info: result.dns_info ? JSON.stringify(result.dns_info) : null,
                provider: result.provider,
                score: result.score,
                toxic: result.toxic,
                toxicity: result.toxicity,
                processed_ts: new Date()
            }));
            
            await trx('Bouncer_Results').insert(detailedResults);
            
            // Update batch status
            await trx('Bouncer_Batches')
                .where('id', batch.id)
                .update({
                    status: 'completed',
                    completed_ts: new Date(),
                    updated_ts: new Date()
                });
            
            // Update queue items
            await trx('Bouncer_Queue')
                .where('batch_id', batch.id)
                .update({
                    status: 'completed',
                    completed_ts: new Date()
                });
        });
    }

    async handleBatchFailure(batch) {
        await db('Bouncer_Batches')
            .where('id', batch.id)
            .update({
                status: 'failed',
                updated_ts: new Date()
            });
        
        // Add to dead letter queue
        await db('Bouncer_Dead_Letter_Queue').insert({
            batch_id: batch.id,
            user_id: batch.user_id,
            request_id: batch.request_id,
            error_message: 'Batch failed during processing',
            failed_ts: new Date()
        });
    }

    async retryFailedBatch(batchId) {
        // Implementation for retrying failed batches
        const batch = await this.getBatchInfo(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }
        
        // Reset batch status and retry
        await db('Bouncer_Batches')
            .where('id', batchId)
            .update({
                status: 'queued',
                updated_ts: new Date()
            });
        
        return { status: 'retried', batchId };
    }

    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                this.logger.error('Health check failed:', error);
            }
        }, this.config.healthCheckInterval);
    }

    stopHealthMonitoring() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    startPeriodicCleanup() {
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.addJob('cleanup-tasks', JOB_TYPES.CLEANUP_RATE_LIMITS, {});
            } catch (error) {
                this.logger.error('Periodic cleanup failed:', error);
            }
        }, this.config.cleanupInterval);
    }

    stopPeriodicCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    async performHealthCheck() {
        const health = await this.getHealthStatus();
        this.lastHealthCheck = health;
        
        // Store health metrics
        await db('Bouncer_Health_Metrics').insert([
            { metric_name: 'total_jobs_processed', metric_value: this.stats.totalJobsProcessed },
            { metric_name: 'total_jobs_failed', metric_value: this.stats.totalJobsFailed },
            { metric_name: 'active_jobs', metric_value: this.stats.activeJobs },
            { metric_name: 'circuit_breaker_failures', metric_value: this.circuitBreaker.getStats().failureCount }
        ]);
        
        this.emit('healthCheck', health);
        return health;
    }

    async checkRedisHealth() {
        try {
            await this.redis.ping();
            return { status: 'healthy', latency: 0 };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    async checkDatabaseHealth() {
        try {
            const start = Date.now();
            await db.raw('SELECT 1');
            const latency = Date.now() - start;
            return { status: 'healthy', latency };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    async checkBouncerApiHealth() {
        return {
            status: this.circuitBreaker.isHealthy() ? 'healthy' : 'unhealthy',
            circuitBreakerState: this.circuitBreaker.getStats().state
        };
    }

    async getRateLimitStatus() {
        const canMakeCall = await this.rateLimiter.canMakeApiCall();
        const nextAvailable = await this.rateLimiter.getNextAvailableTime();
        
        return {
            canMakeCall,
            nextAvailable,
            utilization: canMakeCall ? 'low' : 'high'
        };
    }

    getSystemStats() {
        return {
            totalJobsProcessed: this.stats.totalJobsProcessed,
            totalJobsFailed: this.stats.totalJobsFailed,
            activeJobs: this.stats.activeJobs,
            uptime: this.getUptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    getUptime() {
        return this.stats.lastStartTime ? 
            Date.now() - this.stats.lastStartTime.getTime() : 0;
    }

    async getEstimatedProcessingTime() {
        // Simple estimation based on current queue length
        const queueStats = await this.getQueueStats();
        const totalWaiting = Object.values(queueStats)
            .reduce((sum, stats) => sum + stats.waiting, 0);
        
        // Estimate ~1 minute per job (very rough)
        return Math.max(totalWaiting * 60, 60); // At least 1 minute
    }

    async getEstimatedTimeRemaining(requestId) {
        // Implementation for estimating remaining time
        return 0; // Placeholder
    }

    // Event handlers
    handleWorkerCompleted(workerName, job, result) {
        this.stats.totalJobsProcessed++;
        this.logger.info(`Worker ${workerName} completed job ${job.id}:`, result);
        this.emit('jobCompleted', { workerName, jobId: job.id, result });
    }

    handleWorkerFailed(workerName, job, error) {
        this.stats.totalJobsFailed++;
        this.logger.error(`Worker ${workerName} failed job ${job.id}:`, error);
        this.emit('jobFailed', { workerName, jobId: job.id, error });
    }

    handleWorkerError(workerName, error) {
        this.logger.error(`Worker ${workerName} error:`, error);
        this.emit('workerError', { workerName, error });
    }
}

module.exports = QueueManager;