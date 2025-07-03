/**
 * Error Handler Service for Bouncer Email Verification System
 * 
 * Centralized error handling for all Bouncer operations with comprehensive retry logic,
 * error classification, and integration with the queue system. This service handles
 * different types of errors including rate limits, payment issues, API errors, and
 * network failures with appropriate retry strategies.
 * 
 * Features:
 * - Error classification and categorization
 * - Exponential backoff retry logic
 * - Dead letter queue for permanent failures
 * - Rate limit handling with intelligent scheduling
 * - Payment error handling
 * - Comprehensive logging and monitoring
 * - Integration with BullMQ queue system
 * - Circuit breaker pattern support
 * - Health metrics tracking
 */

const knex = require('knex')(require('../knexfile.js').development);
const rateLimiter = require('./rate-limiter');
const { CircuitBreaker } = require('./circuit-breaker');

// Import queue configuration (handle both CommonJS and ES6 imports)
let queueConfig;
try {
    // Try ES6 import first
    queueConfig = require('../queues/queue-config.js');
} catch (error) {
    // Fallback to direct queue creation if needed
    console.warn('Could not import queue-config, using fallback configuration');
}

class ErrorHandler {
    constructor(options = {}) {
        // Configuration
        this.maxRetries = options.maxRetries || 5;
        this.baseDelay = options.baseDelay || 1000; // 1 second
        this.maxDelay = options.maxDelay || 300000; // 5 minutes
        this.deadLetterQueueEnabled = options.deadLetterQueueEnabled !== false;
        this.logger = options.logger || console;
        
        // Circuit breaker for API calls
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            recoveryTimeout: 60000,
            onStateChange: this.handleCircuitBreakerStateChange.bind(this)
        });
        
        // Error classification patterns
        this.errorPatterns = {
            RATE_LIMIT: [
                { status: 429 },
                { message: /rate limit/i },
                { message: /too many requests/i }
            ],
            PAYMENT_REQUIRED: [
                { status: 402 },
                { message: /payment required/i },
                { message: /insufficient credits/i },
                { message: /billing/i }
            ],
            API_ERROR: [
                { status: [500, 502, 503, 504] },
                { message: /internal server error/i },
                { message: /bad gateway/i },
                { message: /service unavailable/i }
            ],
            NETWORK_ERROR: [
                { code: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'] },
                { message: /network error/i },
                { message: /connection/i }
            ],
            PERMANENT_FAILURE: [
                { status: [400, 401, 403, 404, 422] },
                { message: /invalid api key/i },
                { message: /unauthorized/i },
                { message: /forbidden/i },
                { message: /not found/i },
                { message: /validation error/i }
            ]
        };
        
        // Retry strategies for different error types
        this.retryStrategies = {
            RATE_LIMIT: {
                maxRetries: 10,
                baseDelay: 60000, // 1 minute
                backoffType: 'exponential',
                jitter: true
            },
            PAYMENT_REQUIRED: {
                maxRetries: 0, // Don't retry payment errors
                baseDelay: 0,
                backoffType: 'none',
                jitter: false
            },
            API_ERROR: {
                maxRetries: 5,
                baseDelay: 2000, // 2 seconds
                backoffType: 'exponential',
                jitter: true
            },
            NETWORK_ERROR: {
                maxRetries: 3,
                baseDelay: 1000, // 1 second
                backoffType: 'exponential',
                jitter: true
            },
            PERMANENT_FAILURE: {
                maxRetries: 0, // Don't retry permanent failures
                baseDelay: 0,
                backoffType: 'none',
                jitter: false
            },
            GENERIC_ERROR: {
                maxRetries: 3,
                baseDelay: 1000,
                backoffType: 'exponential',
                jitter: true
            }
        };
        
        // Initialize health metrics
        this.healthMetrics = {
            totalErrors: 0,
            errorsByType: {},
            retriesAttempted: 0,
            permanentFailures: 0,
            circuitBreakerTrips: 0,
            lastResetTime: new Date()
        };
        
        this.logger.info('ErrorHandler initialized with configuration', {
            maxRetries: this.maxRetries,
            deadLetterQueueEnabled: this.deadLetterQueueEnabled,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Classify an error based on its properties
     * @param {Error} error - The error to classify
     * @returns {string} - Error classification
     */
    classifyError(error) {
        try {
            for (const [errorType, patterns] of Object.entries(this.errorPatterns)) {
                for (const pattern of patterns) {
                    if (this.matchesPattern(error, pattern)) {
                        this.logger.debug(`Error classified as ${errorType}`, {
                            error: error.message,
                            status: error.status,
                            code: error.code
                        });
                        return errorType;
                    }
                }
            }
            
            return 'GENERIC_ERROR';
        } catch (classificationError) {
            this.logger.error('Error during error classification:', classificationError);
            return 'GENERIC_ERROR';
        }
    }

    /**
     * Check if an error matches a specific pattern
     * @param {Error} error - The error to check
     * @param {Object} pattern - The pattern to match against
     * @returns {boolean} - True if error matches pattern
     */
    matchesPattern(error, pattern) {
        // Check status code
        if (pattern.status) {
            const statusCodes = Array.isArray(pattern.status) ? pattern.status : [pattern.status];
            if (statusCodes.includes(error.status)) {
                return true;
            }
        }
        
        // Check error code
        if (pattern.code) {
            const codes = Array.isArray(pattern.code) ? pattern.code : [pattern.code];
            if (codes.includes(error.code)) {
                return true;
            }
        }
        
        // Check message pattern
        if (pattern.message && error.message) {
            if (pattern.message instanceof RegExp) {
                return pattern.message.test(error.message);
            } else {
                return error.message.includes(pattern.message);
            }
        }
        
        return false;
    }

    /**
     * Handle batch errors with appropriate retry logic
     * @param {Error} error - The batch error
     * @param {Object} context - Context information (batchId, userId, etc.)
     * @returns {Promise<Object>} - Handling result
     */
    async handleBatchError(error, context = {}) {
        try {
            const errorType = this.classifyError(error);
            const { batchId, userId, requestId, attemptNumber = 1 } = context;
            
            // Update health metrics
            this.updateHealthMetrics(errorType, error);
            
            this.logger.error('Handling batch error', {
                batchId,
                userId,
                requestId,
                errorType,
                error: error.message,
                attemptNumber,
                timestamp: new Date().toISOString()
            });
            
            // Get retry strategy for this error type
            const strategy = this.retryStrategies[errorType];
            
            // Check if we should retry
            if (attemptNumber >= strategy.maxRetries) {
                return await this.handlePermanentFailure(error, context, errorType);
            }
            
            // Handle specific error types
            switch (errorType) {
                case 'RATE_LIMIT':
                    return await this.handleRateLimitError(error, context);
                case 'PAYMENT_REQUIRED':
                    return await this.handlePaymentError(error, context);
                case 'API_ERROR':
                case 'NETWORK_ERROR':
                case 'GENERIC_ERROR':
                    return await this.scheduleRetry(error, context, errorType);
                case 'PERMANENT_FAILURE':
                    return await this.handlePermanentFailure(error, context, errorType);
                default:
                    return await this.scheduleRetry(error, context, errorType);
            }
        } catch (handlingError) {
            this.logger.error('Error in handleBatchError:', handlingError);
            return {
                success: false,
                action: 'error_handler_failure',
                error: handlingError.message,
                originalError: error.message
            };
        }
    }

    /**
     * Handle rate limit errors with intelligent retry scheduling
     * @param {Error} error - The rate limit error
     * @param {Object} context - Context information
     * @returns {Promise<Object>} - Handling result
     */
    async handleRateLimitError(error, context) {
        try {
            const { batchId, userId, requestId } = context;
            
            this.logger.warn('Rate limit error encountered', {
                batchId,
                userId,
                requestId,
                error: error.message
            });
            
            // Get next available time from rate limiter
            const nextAvailableTime = await rateLimiter.getNextAvailableTime();
            const delay = Math.max(nextAvailableTime.getTime() - Date.now(), 60000); // At least 1 minute
            
            // Update batch status if batchId provided
            if (batchId) {
                await this.updateBatchStatus(batchId, 'rate_limited', error.message);
            }
            
            // Schedule retry with rate limit aware delay
            const retryResult = await this.scheduleRetry(error, context, 'RATE_LIMIT', delay);
            
            this.logger.info('Rate limit error handled', {
                batchId,
                retryDelay: delay,
                nextAvailableTime: nextAvailableTime.toISOString()
            });
            
            return {
                ...retryResult,
                rateLimitDelay: delay,
                nextAvailableTime: nextAvailableTime.toISOString()
            };
        } catch (error) {
            this.logger.error('Error handling rate limit error:', error);
            throw error;
        }
    }

    /**
     * Handle payment required errors
     * @param {Error} error - The payment error
     * @param {Object} context - Context information
     * @returns {Promise<Object>} - Handling result
     */
    async handlePaymentError(error, context) {
        try {
            const { batchId, userId, requestId } = context;
            
            this.logger.error('Payment required error encountered', {
                batchId,
                userId,
                requestId,
                error: error.message
            });
            
            // Update batch status
            if (batchId) {
                await this.updateBatchStatus(batchId, 'payment_required', error.message);
            }
            
            // Add to dead letter queue for manual review
            await this.addToDeadLetterQueue({
                batchId,
                userId,
                requestId,
                errorType: 'PAYMENT_REQUIRED',
                error: error.message,
                requiresManualReview: true,
                priority: 'high'
            });
            
            // Send notification (if notification system is available)
            await this.sendPaymentErrorNotification(context, error);
            
            return {
                success: false,
                action: 'payment_required',
                error: error.message,
                requiresManualReview: true,
                deadLetterQueued: true
            };
        } catch (error) {
            this.logger.error('Error handling payment error:', error);
            throw error;
        }
    }

    /**
     * Handle permanent failures by adding to dead letter queue
     * @param {Error} error - The error
     * @param {Object} context - Context information
     * @param {string} errorType - The error type
     * @returns {Promise<Object>} - Handling result
     */
    async handlePermanentFailure(error, context, errorType) {
        try {
            const { batchId, userId, requestId } = context;
            
            this.logger.error('Permanent failure encountered', {
                batchId,
                userId,
                requestId,
                errorType,
                error: error.message
            });
            
            // Update batch status
            if (batchId) {
                await this.updateBatchStatus(batchId, 'failed', error.message);
            }
            
            // Add to dead letter queue
            await this.addToDeadLetterQueue({
                batchId,
                userId,
                requestId,
                errorType,
                error: error.message,
                requiresManualReview: errorType === 'PERMANENT_FAILURE',
                priority: 'medium'
            });
            
            // Update health metrics
            this.healthMetrics.permanentFailures++;
            
            return {
                success: false,
                action: 'permanent_failure',
                error: error.message,
                errorType,
                deadLetterQueued: true
            };
        } catch (error) {
            this.logger.error('Error handling permanent failure:', error);
            throw error;
        }
    }

    /**
     * Schedule a retry with exponential backoff
     * @param {Error} error - The error
     * @param {Object} context - Context information
     * @param {string} errorType - The error type
     * @param {number} customDelay - Custom delay in milliseconds
     * @returns {Promise<Object>} - Scheduling result
     */
    async scheduleRetry(error, context, errorType, customDelay = null) {
        try {
            const { batchId, userId, requestId, attemptNumber = 1 } = context;
            const strategy = this.retryStrategies[errorType];
            
            // Calculate delay
            let delay = customDelay;
            if (delay === null) {
                delay = this.calculateBackoffDelay(attemptNumber, strategy);
            }
            
            this.logger.info('Scheduling retry', {
                batchId,
                userId,
                requestId,
                errorType,
                attemptNumber,
                delay,
                maxRetries: strategy.maxRetries
            });
            
            // Update batch status
            if (batchId) {
                await this.updateBatchStatus(batchId, 'retrying', `Retry ${attemptNumber} scheduled`);
            }
            
            // Schedule retry job based on context
            const retryScheduled = await this.scheduleRetryJob(context, delay);
            
            // Update health metrics
            this.healthMetrics.retriesAttempted++;
            
            return {
                success: true,
                action: 'retry_scheduled',
                attemptNumber,
                delay,
                nextAttemptTime: new Date(Date.now() + delay).toISOString(),
                retryScheduled
            };
        } catch (error) {
            this.logger.error('Error scheduling retry:', error);
            throw error;
        }
    }

    /**
     * Calculate exponential backoff delay with jitter
     * @param {number} attemptNumber - Current attempt number
     * @param {Object} strategy - Retry strategy
     * @returns {number} - Delay in milliseconds
     */
    calculateBackoffDelay(attemptNumber, strategy) {
        let delay = strategy.baseDelay;
        
        switch (strategy.backoffType) {
            case 'exponential':
                delay = strategy.baseDelay * Math.pow(2, attemptNumber - 1);
                break;
            case 'linear':
                delay = strategy.baseDelay * attemptNumber;
                break;
            case 'fixed':
                delay = strategy.baseDelay;
                break;
            default:
                delay = strategy.baseDelay;
        }
        
        // Add jitter if enabled
        if (strategy.jitter) {
            const jitter = Math.random() * 0.1 * delay; // 10% jitter
            delay += jitter;
        }
        
        // Cap at maximum delay
        return Math.min(delay, this.maxDelay);
    }

    /**
     * Schedule a retry job in the appropriate queue
     * @param {Object} context - Context information
     * @param {number} delay - Delay in milliseconds
     * @returns {Promise<boolean>} - True if scheduled successfully
     */
    async scheduleRetryJob(context, delay) {
        try {
            const { batchId, userId, requestId, jobType = 'CREATE_BATCH' } = context;
            
            // Import queue configuration if available
            if (queueConfig && queueConfig.emailVerificationQueue) {
                const jobData = {
                    batchId,
                    userId,
                    requestId,
                    isRetry: true,
                    originalError: context.error
                };
                
                await queueConfig.emailVerificationQueue.add(
                    jobType,
                    jobData,
                    {
                        delay,
                        priority: queueConfig.PRIORITY?.NORMAL || 50,
                        attempts: 1, // We handle retries ourselves
                        removeOnComplete: 50,
                        removeOnFail: 100
                    }
                );
                
                this.logger.info('Retry job scheduled in queue', {
                    batchId,
                    jobType,
                    delay
                });
                
                return true;
            } else {
                // Fallback: store retry information in database for manual processing
                await this.storeRetryInformation(context, delay);
                this.logger.warn('Queue not available, retry information stored in database');
                return false;
            }
        } catch (error) {
            this.logger.error('Error scheduling retry job:', error);
            return false;
        }
    }

    /**
     * Store retry information in database when queue is not available
     * @param {Object} context - Context information
     * @param {number} delay - Delay in milliseconds
     */
    async storeRetryInformation(context, delay) {
        try {
            const { batchId, userId, requestId } = context;
            const retryTime = new Date(Date.now() + delay);
            
            await knex('Bouncer_Batches')
                .where('id', batchId)
                .update({
                    status: 'retrying',
                    error_message: `Retry scheduled for ${retryTime.toISOString()}`,
                    updated_ts: knex.fn.now()
                });
                
            this.logger.info('Retry information stored in database', {
                batchId,
                retryTime: retryTime.toISOString()
            });
        } catch (error) {
            this.logger.error('Error storing retry information:', error);
        }
    }

    /**
     * Update batch status in database
     * @param {number} batchId - Batch ID
     * @param {string} status - New status
     * @param {string} errorMessage - Error message
     */
    async updateBatchStatus(batchId, status, errorMessage = null) {
        try {
            const updateData = {
                status,
                updated_ts: knex.fn.now()
            };
            
            if (errorMessage) {
                updateData.error_message = errorMessage;
            }
            
            await knex('Bouncer_Batches')
                .where('id', batchId)
                .update(updateData);
                
            this.logger.debug('Batch status updated', {
                batchId,
                status,
                errorMessage
            });
        } catch (error) {
            this.logger.error('Error updating batch status:', error);
        }
    }

    /**
     * Add failed item to dead letter queue
     * @param {Object} item - Dead letter queue item
     */
    async addToDeadLetterQueue(item) {
        try {
            if (!this.deadLetterQueueEnabled) {
                this.logger.warn('Dead letter queue disabled, skipping item');
                return;
            }
            
            const dlqItem = {
                batch_id: item.batchId,
                user_id: item.userId,
                request_id: item.requestId,
                error_message: JSON.stringify({
                    type: item.errorType,
                    message: item.error,
                    timestamp: new Date().toISOString(),
                    requiresManualReview: item.requiresManualReview || false,
                    priority: item.priority || 'medium'
                }),
                failed_ts: knex.fn.now(),
                reviewed: false
            };
            
            await knex('Bouncer_Dead_Letter_Queue').insert(dlqItem);
            
            this.logger.info('Item added to dead letter queue', {
                batchId: item.batchId,
                errorType: item.errorType,
                requiresManualReview: item.requiresManualReview
            });
        } catch (error) {
            this.logger.error('Error adding item to dead letter queue:', error);
        }
    }

    /**
     * Send payment error notification
     * @param {Object} context - Context information
     * @param {Error} error - Payment error
     */
    async sendPaymentErrorNotification(context, error) {
        try {
            // This would integrate with your notification system
            // For now, we'll just log the notification
            this.logger.warn('Payment error notification should be sent', {
                userId: context.userId,
                batchId: context.batchId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            // Future implementation could include:
            // - Email notifications
            // - Slack/Discord webhooks
            // - Dashboard alerts
            // - SMS notifications for critical failures
        } catch (error) {
            this.logger.error('Error sending payment error notification:', error);
        }
    }

    /**
     * Handle circuit breaker state changes
     * @param {Object} stateChange - State change information
     */
    async handleCircuitBreakerStateChange(stateChange) {
        try {
            const { oldState, newState, failureCount } = stateChange;
            
            this.logger.warn('Circuit breaker state changed', {
                oldState,
                newState,
                failureCount,
                timestamp: new Date().toISOString()
            });
            
            // Update health metrics
            if (newState === 'OPEN') {
                this.healthMetrics.circuitBreakerTrips++;
            }
            
            // Store circuit breaker event
            await this.storeHealthMetric('circuit_breaker_state_change', 1, {
                oldState,
                newState,
                failureCount
            });
        } catch (error) {
            this.logger.error('Error handling circuit breaker state change:', error);
        }
    }

    /**
     * Update health metrics
     * @param {string} errorType - Error type
     * @param {Error} error - The error
     */
    updateHealthMetrics(errorType, error) {
        try {
            this.healthMetrics.totalErrors++;
            
            if (!this.healthMetrics.errorsByType[errorType]) {
                this.healthMetrics.errorsByType[errorType] = 0;
            }
            this.healthMetrics.errorsByType[errorType]++;
            
            // Store in database for long-term tracking
            setImmediate(async () => {
                await this.storeHealthMetric(`error_${errorType.toLowerCase()}`, 1, {
                    message: error.message,
                    status: error.status,
                    code: error.code
                });
            });
        } catch (error) {
            this.logger.error('Error updating health metrics:', error);
        }
    }

    /**
     * Store health metric in database
     * @param {string} metricName - Metric name
     * @param {number} metricValue - Metric value
     * @param {Object} metadata - Additional metadata
     */
    async storeHealthMetric(metricName, metricValue, metadata = {}) {
        try {
            await knex('Bouncer_Health_Metrics').insert({
                metric_name: metricName,
                metric_value: metricValue,
                metadata: JSON.stringify(metadata),
                recorded_ts: knex.fn.now()
            });
        } catch (error) {
            this.logger.error('Error storing health metric:', error);
        }
    }

    /**
     * Get current health metrics
     * @returns {Object} - Health metrics
     */
    getHealthMetrics() {
        return {
            ...this.healthMetrics,
            circuitBreakerStatus: this.circuitBreaker.getStats(),
            uptime: Date.now() - this.healthMetrics.lastResetTime.getTime()
        };
    }

    /**
     * Reset health metrics
     */
    resetHealthMetrics() {
        this.healthMetrics = {
            totalErrors: 0,
            errorsByType: {},
            retriesAttempted: 0,
            permanentFailures: 0,
            circuitBreakerTrips: 0,
            lastResetTime: new Date()
        };
        
        this.logger.info('Health metrics reset');
    }

    /**
     * Get dead letter queue items for manual review
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Dead letter queue items
     */
    async getDeadLetterQueueItems(options = {}) {
        try {
            const {
                limit = 100,
                offset = 0,
                reviewed = false,
                errorType = null,
                userId = null
            } = options;
            
            let query = knex('Bouncer_Dead_Letter_Queue')
                .where('reviewed', reviewed)
                .orderBy('failed_ts', 'desc')
                .limit(limit)
                .offset(offset);
            
            if (userId) {
                query = query.where('user_id', userId);
            }
            
            const items = await query;
            
            // Parse error messages
            return items.map(item => ({
                ...item,
                error_details: JSON.parse(item.error_message)
            }));
        } catch (error) {
            this.logger.error('Error getting dead letter queue items:', error);
            return [];
        }
    }

    /**
     * Mark dead letter queue item as reviewed
     * @param {number} itemId - Item ID
     * @returns {Promise<boolean>} - Success status
     */
    async markDeadLetterItemReviewed(itemId) {
        try {
            await knex('Bouncer_Dead_Letter_Queue')
                .where('id', itemId)
                .update({
                    reviewed: true,
                    reviewed_ts: knex.fn.now()
                });
            
            this.logger.info('Dead letter queue item marked as reviewed', { itemId });
            return true;
        } catch (error) {
            this.logger.error('Error marking dead letter queue item as reviewed:', error);
            return false;
        }
    }

    /**
     * Clean up old dead letter queue items
     * @param {number} daysOld - Days old threshold
     * @returns {Promise<number>} - Number of items cleaned up
     */
    async cleanupDeadLetterQueue(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            const deletedCount = await knex('Bouncer_Dead_Letter_Queue')
                .where('reviewed', true)
                .where('failed_ts', '<', cutoffDate)
                .del();
            
            this.logger.info(`Cleaned up ${deletedCount} old dead letter queue items`);
            return deletedCount;
        } catch (error) {
            this.logger.error('Error cleaning up dead letter queue:', error);
            return 0;
        }
    }

    /**
     * Health check for the error handler
     * @returns {Promise<Object>} - Health status
     */
    async healthCheck() {
        try {
            const metrics = this.getHealthMetrics();
            const circuitBreakerHealthy = this.circuitBreaker.isHealthy();
            
            // Check dead letter queue size
            const dlqCount = await knex('Bouncer_Dead_Letter_Queue')
                .where('reviewed', false)
                .count('* as count')
                .first();
            
            const unreviewed = parseInt(dlqCount.count) || 0;
            
            return {
                status: circuitBreakerHealthy && unreviewed < 1000 ? 'healthy' : 'degraded',
                metrics,
                circuitBreakerHealthy,
                deadLetterQueueSize: unreviewed,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Error in health check:', error);
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export singleton instance
const errorHandler = new ErrorHandler();

module.exports = errorHandler;