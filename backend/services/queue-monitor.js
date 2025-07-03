import {
    ALL_QUEUES,
    ALL_SCHEDULERS,
    emailVerificationQueue,
    batchStatusQueue,
    batchDownloadQueue,
    cleanupQueue,
    redis,
    JOB_TYPES,
    PRIORITY,
    ERROR_TYPES,
    checkQueueHealth
} from '../queues/queue-config.js';

/**
 * Queue Monitor Service for Bouncer Email Verification System
 * 
 * This service provides comprehensive monitoring and management functionality
 * for all BullMQ queues in the Bouncer email verification system.
 * 
 * Features:
 * - Real-time queue statistics monitoring
 * - Queue management (pause/resume operations)
 * - Failed job retry functionality
 * - Queue health monitoring and alerting
 * - Performance metrics tracking
 * - Error classification and reporting
 * 
 * Monitors the following queues:
 * - email-verification: Batch creation and retry logic
 * - batch-status-check: Batch processing status monitoring
 * - batch-download: Result download and processing
 * - cleanup-tasks: Housekeeping and health checks
 */

class QueueMonitor {
    constructor() {
        this.queues = {
            'email-verification': emailVerificationQueue,
            'batch-status-check': batchStatusQueue,
            'batch-download': batchDownloadQueue,
            'cleanup-tasks': cleanupQueue
        };
        
        this.queueNames = Object.keys(this.queues);
        this.healthCheckInterval = null;
        this.metricsCollectionInterval = null;
        this.alertThresholds = {
            queueBacklog: 1000,
            failedJobsThreshold: 50,
            errorRateThreshold: 0.05, // 5%
            responseTimeThreshold: 30000, // 30 seconds
            stalledJobsThreshold: 10
        };
        
        this.metrics = {
            lastUpdated: new Date(),
            queues: {},
            system: {},
            alerts: []
        };
    }

    /**
     * Get comprehensive statistics for all queues
     * @returns {Object} Queue statistics including counts, metrics, and health status
     */
    async getQueueStats() {
        const stats = {
            timestamp: new Date(),
            redis: {
                connected: redis.status === 'ready',
                status: redis.status
            },
            queues: {},
            summary: {
                totalWaiting: 0,
                totalActive: 0,
                totalCompleted: 0,
                totalFailed: 0,
                totalDelayed: 0,
                healthyQueues: 0,
                totalQueues: this.queueNames.length
            }
        };

        // Collect stats for each queue
        for (const queueName of this.queueNames) {
            const queue = this.queues[queueName];
            
            try {
                const [waiting, active, completed, failed, delayed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed(),
                    queue.getDelayed()
                ]);

                const queueStats = {
                    name: queueName,
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    delayed: delayed.length,
                    paused: await queue.isPaused(),
                    healthy: true,
                    lastJobTimestamp: null,
                    averageProcessingTime: null,
                    errorRate: 0,
                    throughput: 0
                };

                // Calculate error rate
                if (queueStats.completed > 0 || queueStats.failed > 0) {
                    queueStats.errorRate = queueStats.failed / (queueStats.completed + queueStats.failed);
                }

                // Get last job timestamp
                if (completed.length > 0) {
                    queueStats.lastJobTimestamp = completed[completed.length - 1].timestamp;
                }

                // Calculate average processing time from recent completed jobs
                if (completed.length > 0) {
                    const recentJobs = completed.slice(-10); // Last 10 jobs
                    let totalProcessingTime = 0;
                    let validJobs = 0;

                    for (const job of recentJobs) {
                        if (job.processedOn && job.timestamp) {
                            totalProcessingTime += (job.processedOn - job.timestamp);
                            validJobs++;
                        }
                    }

                    if (validJobs > 0) {
                        queueStats.averageProcessingTime = totalProcessingTime / validJobs;
                    }
                }

                // Update summary totals
                stats.summary.totalWaiting += queueStats.waiting;
                stats.summary.totalActive += queueStats.active;
                stats.summary.totalCompleted += queueStats.completed;
                stats.summary.totalFailed += queueStats.failed;
                stats.summary.totalDelayed += queueStats.delayed;
                stats.summary.healthyQueues++;

                stats.queues[queueName] = queueStats;

            } catch (error) {
                console.error(`Error getting stats for queue ${queueName}:`, error);
                stats.queues[queueName] = {
                    name: queueName,
                    healthy: false,
                    error: error.message,
                    waiting: 0,
                    active: 0,
                    completed: 0,
                    failed: 0,
                    delayed: 0,
                    paused: false
                };
            }
        }

        // Update internal metrics
        this.metrics.queues = stats.queues;
        this.metrics.lastUpdated = stats.timestamp;

        return stats;
    }

    /**
     * Pause a specific queue
     * @param {string} queueName - Name of the queue to pause
     * @returns {Object} Operation result
     */
    async pauseQueue(queueName) {
        if (!this.queues[queueName]) {
            throw new Error(`Queue '${queueName}' not found. Available queues: ${this.queueNames.join(', ')}`);
        }

        try {
            const queue = this.queues[queueName];
            await queue.pause();
            
            console.log(`Queue '${queueName}' paused successfully`);
            
            return {
                success: true,
                queueName,
                action: 'paused',
                timestamp: new Date()
            };
        } catch (error) {
            console.error(`Error pausing queue '${queueName}':`, error);
            throw new Error(`Failed to pause queue '${queueName}': ${error.message}`);
        }
    }

    /**
     * Resume a specific queue
     * @param {string} queueName - Name of the queue to resume
     * @returns {Object} Operation result
     */
    async resumeQueue(queueName) {
        if (!this.queues[queueName]) {
            throw new Error(`Queue '${queueName}' not found. Available queues: ${this.queueNames.join(', ')}`);
        }

        try {
            const queue = this.queues[queueName];
            await queue.resume();
            
            console.log(`Queue '${queueName}' resumed successfully`);
            
            return {
                success: true,
                queueName,
                action: 'resumed',
                timestamp: new Date()
            };
        } catch (error) {
            console.error(`Error resuming queue '${queueName}':`, error);
            throw new Error(`Failed to resume queue '${queueName}': ${error.message}`);
        }
    }

    /**
     * Retry all failed jobs in a specific queue
     * @param {string} queueName - Name of the queue to retry failed jobs
     * @param {Object} options - Retry options
     * @returns {Object} Operation result with retry count
     */
    async retryFailedJobs(queueName, options = {}) {
        if (!this.queues[queueName]) {
            throw new Error(`Queue '${queueName}' not found. Available queues: ${this.queueNames.join(', ')}`);
        }

        const {
            maxRetries = 50,
            skipRecentlyFailed = true,
            recentlyFailedThreshold = 300000, // 5 minutes
            batchSize = 10
        } = options;

        try {
            const queue = this.queues[queueName];
            const failedJobs = await queue.getFailed();
            
            if (failedJobs.length === 0) {
                return {
                    success: true,
                    queueName,
                    action: 'retry_failed',
                    retriedCount: 0,
                    skippedCount: 0,
                    totalFailedJobs: 0,
                    timestamp: new Date()
                };
            }

            let retriedCount = 0;
            let skippedCount = 0;
            const now = Date.now();

            // Filter jobs to retry
            const jobsToRetry = failedJobs.filter(job => {
                // Skip jobs that failed too recently if option is enabled
                if (skipRecentlyFailed && job.failedReason) {
                    const failedTime = job.timestamp || job.processedOn;
                    if (failedTime && (now - failedTime) < recentlyFailedThreshold) {
                        skippedCount++;
                        return false;
                    }
                }
                
                // Limit the number of retries
                if (retriedCount >= maxRetries) {
                    skippedCount++;
                    return false;
                }
                
                return true;
            });

            // Process jobs in batches
            const batches = [];
            for (let i = 0; i < jobsToRetry.length; i += batchSize) {
                batches.push(jobsToRetry.slice(i, i + batchSize));
            }

            for (const batch of batches) {
                try {
                    await Promise.all(batch.map(job => job.retry()));
                    retriedCount += batch.length;
                } catch (error) {
                    console.error(`Error retrying batch of jobs in queue '${queueName}':`, error);
                    // Continue with next batch
                }
            }

            console.log(`Retried ${retriedCount} failed jobs in queue '${queueName}' (skipped: ${skippedCount})`);
            
            return {
                success: true,
                queueName,
                action: 'retry_failed',
                retriedCount,
                skippedCount,
                totalFailedJobs: failedJobs.length,
                timestamp: new Date()
            };
        } catch (error) {
            console.error(`Error retrying failed jobs in queue '${queueName}':`, error);
            throw new Error(`Failed to retry failed jobs in queue '${queueName}': ${error.message}`);
        }
    }

    /**
     * Get comprehensive queue health assessment
     * @returns {Object} Detailed health report with recommendations
     */
    async getQueueHealth() {
        const health = {
            timestamp: new Date(),
            overallHealth: 'healthy',
            score: 100,
            redis: {
                connected: redis.status === 'ready',
                status: redis.status
            },
            queues: {},
            alerts: [],
            recommendations: [],
            metrics: {
                totalBacklog: 0,
                totalFailed: 0,
                averageErrorRate: 0,
                slowestQueue: null,
                busiestQueue: null
            }
        };

        let totalErrorRate = 0;
        let healthyQueues = 0;
        let maxBacklog = 0;
        let slowestProcessingTime = 0;
        let busiestQueue = null;
        let maxActive = 0;

        // Assess each queue
        for (const queueName of this.queueNames) {
            const queue = this.queues[queueName];
            
            try {
                const [waiting, active, completed, failed, delayed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed(),
                    queue.getDelayed()
                ]);

                const queueHealth = {
                    name: queueName,
                    status: 'healthy',
                    score: 100,
                    issues: [],
                    metrics: {
                        waiting: waiting.length,
                        active: active.length,
                        completed: completed.length,
                        failed: failed.length,
                        delayed: delayed.length,
                        paused: await queue.isPaused(),
                        errorRate: 0,
                        averageProcessingTime: null,
                        stalledJobs: 0
                    }
                };

                // Calculate error rate
                if (completed.length > 0 || failed.length > 0) {
                    queueHealth.metrics.errorRate = failed.length / (completed.length + failed.length);
                }

                // Check for stalled jobs (active jobs that haven't been processed)
                const stalledJobs = active.filter(job => {
                    const stalledTime = Date.now() - (job.processedOn || job.timestamp);
                    return stalledTime > this.alertThresholds.responseTimeThreshold;
                });
                queueHealth.metrics.stalledJobs = stalledJobs.length;

                // Assess queue health and deduct points for issues
                if (queueHealth.metrics.paused) {
                    queueHealth.issues.push('Queue is paused');
                    queueHealth.score -= 30;
                }

                if (waiting.length > this.alertThresholds.queueBacklog) {
                    queueHealth.issues.push(`High backlog: ${waiting.length} jobs waiting`);
                    queueHealth.score -= 20;
                }

                if (failed.length > this.alertThresholds.failedJobsThreshold) {
                    queueHealth.issues.push(`High failed job count: ${failed.length}`);
                    queueHealth.score -= 15;
                }

                if (queueHealth.metrics.errorRate > this.alertThresholds.errorRateThreshold) {
                    queueHealth.issues.push(`High error rate: ${(queueHealth.metrics.errorRate * 100).toFixed(2)}%`);
                    queueHealth.score -= 25;
                }

                if (stalledJobs.length > this.alertThresholds.stalledJobsThreshold) {
                    queueHealth.issues.push(`Stalled jobs detected: ${stalledJobs.length}`);
                    queueHealth.score -= 20;
                }

                // Determine status based on score
                if (queueHealth.score >= 80) {
                    queueHealth.status = 'healthy';
                } else if (queueHealth.score >= 60) {
                    queueHealth.status = 'warning';
                } else {
                    queueHealth.status = 'critical';
                }

                // Update overall metrics
                health.metrics.totalBacklog += waiting.length;
                health.metrics.totalFailed += failed.length;
                totalErrorRate += queueHealth.metrics.errorRate;
                
                if (waiting.length > maxBacklog) {
                    maxBacklog = waiting.length;
                }
                
                if (active.length > maxActive) {
                    maxActive = active.length;
                    busiestQueue = queueName;
                }

                if (queueHealth.status === 'healthy') {
                    healthyQueues++;
                }

                health.queues[queueName] = queueHealth;

            } catch (error) {
                console.error(`Error assessing health for queue ${queueName}:`, error);
                health.queues[queueName] = {
                    name: queueName,
                    status: 'error',
                    score: 0,
                    issues: [`Health check failed: ${error.message}`],
                    metrics: {}
                };
            }
        }

        // Calculate overall health metrics
        health.metrics.averageErrorRate = totalErrorRate / this.queueNames.length;
        health.metrics.busiestQueue = busiestQueue;

        // Determine overall health
        const overallScore = (healthyQueues / this.queueNames.length) * 100;
        health.score = Math.round(overallScore);

        if (health.score >= 80) {
            health.overallHealth = 'healthy';
        } else if (health.score >= 60) {
            health.overallHealth = 'warning';
        } else {
            health.overallHealth = 'critical';
        }

        // Generate alerts based on thresholds
        if (health.metrics.totalBacklog > this.alertThresholds.queueBacklog) {
            health.alerts.push({
                level: 'warning',
                message: `High system backlog: ${health.metrics.totalBacklog} jobs`,
                timestamp: new Date()
            });
        }

        if (health.metrics.totalFailed > this.alertThresholds.failedJobsThreshold) {
            health.alerts.push({
                level: 'critical',
                message: `High system failure rate: ${health.metrics.totalFailed} failed jobs`,
                timestamp: new Date()
            });
        }

        if (!health.redis.connected) {
            health.alerts.push({
                level: 'critical',
                message: 'Redis connection is down',
                timestamp: new Date()
            });
        }

        // Generate recommendations
        if (health.metrics.totalBacklog > 100) {
            health.recommendations.push('Consider increasing worker concurrency or adding more workers');
        }

        if (health.metrics.averageErrorRate > 0.1) {
            health.recommendations.push('Investigate high error rates and improve error handling');
        }

        if (health.metrics.busiestQueue) {
            health.recommendations.push(`Queue '${health.metrics.busiestQueue}' is busiest - monitor for bottlenecks`);
        }

        // Update internal metrics
        this.metrics.system = health.metrics;
        this.metrics.alerts = health.alerts;
        this.metrics.lastUpdated = health.timestamp;

        return health;
    }

    /**
     * Get detailed information about a specific queue
     * @param {string} queueName - Name of the queue to inspect
     * @returns {Object} Detailed queue information
     */
    async getQueueDetails(queueName) {
        if (!this.queues[queueName]) {
            throw new Error(`Queue '${queueName}' not found. Available queues: ${this.queueNames.join(', ')}`);
        }

        const queue = this.queues[queueName];
        
        try {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
                queue.getWaiting(),
                queue.getActive(),
                queue.getCompleted(),
                queue.getFailed(),
                queue.getDelayed()
            ]);

            const details = {
                name: queueName,
                timestamp: new Date(),
                paused: await queue.isPaused(),
                counts: {
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length,
                    delayed: delayed.length
                },
                recentJobs: {
                    waiting: waiting.slice(-5).map(job => ({
                        id: job.id,
                        name: job.name,
                        data: job.data,
                        timestamp: job.timestamp
                    })),
                    active: active.slice(-5).map(job => ({
                        id: job.id,
                        name: job.name,
                        data: job.data,
                        timestamp: job.timestamp,
                        processedOn: job.processedOn
                    })),
                    completed: completed.slice(-5).map(job => ({
                        id: job.id,
                        name: job.name,
                        data: job.data,
                        timestamp: job.timestamp,
                        processedOn: job.processedOn,
                        returnvalue: job.returnvalue
                    })),
                    failed: failed.slice(-5).map(job => ({
                        id: job.id,
                        name: job.name,
                        data: job.data,
                        timestamp: job.timestamp,
                        failedReason: job.failedReason,
                        stacktrace: job.stacktrace
                    }))
                },
                metrics: {
                    errorRate: 0,
                    averageProcessingTime: null,
                    throughput: 0
                }
            };

            // Calculate error rate
            if (details.counts.completed > 0 || details.counts.failed > 0) {
                details.metrics.errorRate = details.counts.failed / (details.counts.completed + details.counts.failed);
            }

            // Calculate average processing time
            if (completed.length > 0) {
                let totalProcessingTime = 0;
                let validJobs = 0;

                for (const job of completed.slice(-20)) { // Last 20 jobs
                    if (job.processedOn && job.timestamp) {
                        totalProcessingTime += (job.processedOn - job.timestamp);
                        validJobs++;
                    }
                }

                if (validJobs > 0) {
                    details.metrics.averageProcessingTime = totalProcessingTime / validJobs;
                }
            }

            return details;
        } catch (error) {
            console.error(`Error getting details for queue ${queueName}:`, error);
            throw new Error(`Failed to get details for queue '${queueName}': ${error.message}`);
        }
    }

    /**
     * Clean up completed and failed jobs from all queues
     * @param {Object} options - Cleanup options
     * @returns {Object} Cleanup results
     */
    async cleanupJobs(options = {}) {
        const {
            keepCompleted = 50,
            keepFailed = 100,
            age = 86400000 // 24 hours
        } = options;

        const results = {
            timestamp: new Date(),
            queues: {},
            summary: {
                totalCleaned: 0,
                totalErrors: 0
            }
        };

        for (const queueName of this.queueNames) {
            const queue = this.queues[queueName];
            
            try {
                const cleanedCompleted = await queue.clean(age, keepCompleted, 'completed');
                const cleanedFailed = await queue.clean(age, keepFailed, 'failed');
                
                results.queues[queueName] = {
                    cleanedCompleted,
                    cleanedFailed,
                    total: cleanedCompleted + cleanedFailed,
                    success: true
                };
                
                results.summary.totalCleaned += cleanedCompleted + cleanedFailed;
                
            } catch (error) {
                console.error(`Error cleaning queue ${queueName}:`, error);
                results.queues[queueName] = {
                    error: error.message,
                    success: false
                };
                results.summary.totalErrors++;
            }
        }

        return results;
    }

    /**
     * Get a queue instance by name
     * @param {string} queueName - Name of the queue
     * @returns {Queue} Queue instance
     */
    getQueueByName(queueName) {
        if (!this.queues[queueName]) {
            throw new Error(`Queue '${queueName}' not found. Available queues: ${this.queueNames.join(', ')}`);
        }
        return this.queues[queueName];
    }

    /**
     * Get all available queue names
     * @returns {string[]} Array of queue names
     */
    getQueueNames() {
        return this.queueNames;
    }

    /**
     * Get current metrics snapshot
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            alertThresholds: this.alertThresholds
        };
    }

    /**
     * Update alert thresholds
     * @param {Object} newThresholds - New threshold values
     */
    updateAlertThresholds(newThresholds) {
        this.alertThresholds = {
            ...this.alertThresholds,
            ...newThresholds
        };
    }

    /**
     * Start periodic health monitoring
     * @param {number} interval - Monitoring interval in milliseconds (default: 30 seconds)
     */
    startHealthMonitoring(interval = 30000) {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.getQueueHealth();
                
                // Log critical alerts
                health.alerts.forEach(alert => {
                    if (alert.level === 'critical') {
                        console.error(`CRITICAL ALERT: ${alert.message}`);
                    }
                });
                
                // Log overall health status
                if (health.overallHealth !== 'healthy') {
                    console.warn(`Queue system health: ${health.overallHealth} (score: ${health.score})`);
                }
            } catch (error) {
                console.error('Error during health monitoring:', error);
            }
        }, interval);

        console.log(`Health monitoring started with ${interval}ms interval`);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            console.log('Health monitoring stopped');
        }
    }

    /**
     * Start periodic metrics collection
     * @param {number} interval - Collection interval in milliseconds (default: 60 seconds)
     */
    startMetricsCollection(interval = 60000) {
        if (this.metricsCollectionInterval) {
            clearInterval(this.metricsCollectionInterval);
        }

        this.metricsCollectionInterval = setInterval(async () => {
            try {
                await this.getQueueStats();
            } catch (error) {
                console.error('Error during metrics collection:', error);
            }
        }, interval);

        console.log(`Metrics collection started with ${interval}ms interval`);
    }

    /**
     * Stop metrics collection
     */
    stopMetricsCollection() {
        if (this.metricsCollectionInterval) {
            clearInterval(this.metricsCollectionInterval);
            this.metricsCollectionInterval = null;
            console.log('Metrics collection stopped');
        }
    }

    /**
     * Shutdown the monitor and clean up resources
     */
    async shutdown() {
        console.log('Shutting down Queue Monitor...');
        
        this.stopHealthMonitoring();
        this.stopMetricsCollection();
        
        console.log('Queue Monitor shutdown complete');
    }
}

// Export the QueueMonitor class
export default QueueMonitor;

// Also export a singleton instance for convenience
export const queueMonitor = new QueueMonitor();