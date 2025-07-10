const knex = require('knex')(require('../knexfile.js').development);

/**
 * Dead Letter Queue Service
 * 
 * Production-ready service for handling permanently failed items in the Bouncer email verification system.
 * Provides comprehensive logging, retry functionality, and management capabilities for failed batches.
 */
class DeadLetterQueueService {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.maxRetryAttempts = options.maxRetryAttempts || 3;
        this.retryDelayMs = options.retryDelayMs || 60000; // 1 minute default
        
        this.logger.info('Dead Letter Queue Service initialized', {
            maxRetryAttempts: this.maxRetryAttempts,
            retryDelayMs: this.retryDelayMs
        });
    }
    
    /**
     * Log a batch to the dead letter queue
     * @param {Object} options - Options for logging the failed batch
     * @param {number} options.batchId - The batch ID that failed
     * @param {number} options.userId - User ID associated with the batch
     * @param {number} options.requestId - Request ID associated with the batch
     * @param {string} options.errorMessage - Error message describing the failure
     * @param {Object} options.metadata - Additional metadata about the failure
     * @returns {Promise<Object>} Result of the logging operation
     */
    async logToDeadLetterQueue(options) {
        const { batchId, userId, requestId, errorMessage, metadata = {} } = options;
        
        if (!batchId || !userId || !requestId || !errorMessage) {
            throw new Error('Missing required parameters: batchId, userId, requestId, and errorMessage are required');
        }
        
        try {
            this.logger.warn('Logging batch to dead letter queue', {
                batchId,
                userId,
                requestId,
                errorMessage: errorMessage.substring(0, 100) + '...',
                metadata
            });
            
            const deadLetterEntry = {
                batch_id: batchId,
                user_id: userId,
                request_id: requestId,
                error_message: errorMessage,
                failed_ts: new Date(),
                reviewed: false
            };
            
            // Add metadata as JSON if provided
            if (Object.keys(metadata).length > 0) {
                deadLetterEntry.metadata = JSON.stringify(metadata);
            }
            
            const [insertedId] = await knex('Bouncer_Dead_Letter_Queue').insert(deadLetterEntry);
            
            this.logger.info('Batch logged to dead letter queue successfully', {
                deadLetterQueueId: insertedId,
                batchId,
                userId,
                requestId
            });
            
            return {
                success: true,
                deadLetterQueueId: insertedId,
                message: 'Batch logged to dead letter queue successfully'
            };
            
        } catch (error) {
            this.logger.error('Failed to log batch to dead letter queue', {
                error: error.message,
                batchId,
                userId,
                requestId,
                errorMessage: errorMessage.substring(0, 100) + '...'
            });
            
            throw new Error(`Failed to log to dead letter queue: ${error.message}`);
        }
    }
    
    /**
     * Get failed items from the dead letter queue
     * @param {Object} options - Options for retrieving failed items
     * @param {number} options.limit - Maximum number of items to retrieve (default: 100)
     * @param {number} options.offset - Number of items to skip (default: 0)
     * @param {number} options.userId - Filter by user ID (optional)
     * @param {boolean} options.reviewedOnly - Only get reviewed items (default: false)
     * @param {boolean} options.unreviewedOnly - Only get unreviewed items (default: false)
     * @param {Date} options.fromDate - Get items from this date onwards (optional)
     * @param {Date} options.toDate - Get items up to this date (optional)
     * @returns {Promise<Object>} Failed items with pagination info
     */
    async getFailedItems(options = {}) {
        const {
            limit = 100,
            offset = 0,
            userId = null,
            reviewedOnly = false,
            unreviewedOnly = false,
            fromDate = null,
            toDate = null
        } = options;
        
        try {
            let query = knex('Bouncer_Dead_Letter_Queue')
                .select([
                    'id',
                    'batch_id',
                    'user_id',
                    'request_id',
                    'error_message',
                    'failed_ts',
                    'reviewed',
                    'metadata'
                ])
                .orderBy('failed_ts', 'desc');
            
            // Apply filters
            if (userId) {
                query = query.where('user_id', userId);
            }
            
            if (reviewedOnly) {
                query = query.where('reviewed', true);
            } else if (unreviewedOnly) {
                query = query.where('reviewed', false);
            }
            
            if (fromDate) {
                query = query.where('failed_ts', '>=', fromDate);
            }
            
            if (toDate) {
                query = query.where('failed_ts', '<=', toDate);
            }
            
            // Get total count for pagination
            const countQuery = query.clone().count('* as total');
            const [{ total }] = await countQuery;
            
            // Apply pagination
            const items = await query.limit(limit).offset(offset);
            
            // Parse metadata for each item
            const processedItems = items.map(item => ({
                ...item,
                metadata: item.metadata ? JSON.parse(item.metadata) : null
            }));
            
            this.logger.debug('Retrieved failed items from dead letter queue', {
                totalItems: total,
                returnedItems: processedItems.length,
                limit,
                offset,
                filters: { userId, reviewedOnly, unreviewedOnly, fromDate, toDate }
            });
            
            return {
                success: true,
                items: processedItems,
                pagination: {
                    total: parseInt(total),
                    limit,
                    offset,
                    hasMore: offset + items.length < total
                }
            };
            
        } catch (error) {
            this.logger.error('Failed to retrieve failed items from dead letter queue', {
                error: error.message,
                options
            });
            
            throw new Error(`Failed to retrieve failed items: ${error.message}`);
        }
    }
    
    /**
     * Retry failed items from the dead letter queue
     * @param {Object} options - Options for retrying failed items
     * @param {Array<number>} options.deadLetterQueueIds - Array of dead letter queue IDs to retry
     * @param {number} options.userId - User ID (for authorization - optional)
     * @param {boolean} options.markAsReviewed - Mark items as reviewed after retry (default: true)
     * @returns {Promise<Object>} Result of the retry operation
     */
    async retryFailedItems(options) {
        const { deadLetterQueueIds, userId = null, markAsReviewed = true } = options;
        
        if (!Array.isArray(deadLetterQueueIds) || deadLetterQueueIds.length === 0) {
            throw new Error('deadLetterQueueIds must be a non-empty array');
        }
        
        const results = {
            success: true,
            totalRequested: deadLetterQueueIds.length,
            retryAttempts: 0,
            successful: 0,
            failed: 0,
            errors: []
        };
        
        try {
            // Use transaction to ensure consistency
            await knex.transaction(async (trx) => {
                // Get the dead letter queue entries
                let query = trx('Bouncer_Dead_Letter_Queue')
                    .whereIn('id', deadLetterQueueIds)
                    .select([
                        'id',
                        'batch_id',
                        'user_id',
                        'request_id',
                        'error_message',
                        'failed_ts'
                    ]);
                
                // Apply user filter if provided
                if (userId) {
                    query = query.where('user_id', userId);
                }
                
                const deadLetterEntries = await query;
                
                if (deadLetterEntries.length === 0) {
                    throw new Error('No dead letter queue entries found with the provided IDs');
                }
                
                this.logger.info('Starting retry process for failed items', {
                    requestedIds: deadLetterQueueIds.length,
                    foundEntries: deadLetterEntries.length,
                    userId
                });
                
                // Process each entry
                for (const entry of deadLetterEntries) {
                    try {
                        results.retryAttempts++;
                        
                        // Check if the batch still exists and can be retried
                        const batchInfo = await trx('Bouncer_Batches')
                            .where('id', entry.batch_id)
                            .select(['id', 'batch_id', 'status', 'retry_count'])
                            .first();
                        
                        if (!batchInfo) {
                            throw new Error(`Batch ${entry.batch_id} not found in Bouncer_Batches table`);
                        }
                        
                        if (batchInfo.retry_count >= this.maxRetryAttempts) {
                            throw new Error(`Batch ${entry.batch_id} has exceeded maximum retry attempts (${this.maxRetryAttempts})`);
                        }
                        
                        // Reset batch status to queued for retry
                        await trx('Bouncer_Batches')
                            .where('id', entry.batch_id)
                            .update({
                                status: 'queued',
                                retry_count: batchInfo.retry_count + 1,
                                error_message: null,
                                updated_ts: new Date()
                            });
                        
                        // Reset associated queue items to queued status
                        await trx('Bouncer_Queue')
                            .where('batch_id', entry.batch_id)
                            .update({
                                status: 'queued',
                                assigned_ts: null,
                                completed_ts: null
                            });
                        
                        // Mark as reviewed if requested
                        if (markAsReviewed) {
                            await trx('Bouncer_Dead_Letter_Queue')
                                .where('id', entry.id)
                                .update({ reviewed: true });
                        }
                        
                        results.successful++;
                        
                        this.logger.info('Successfully retried failed item', {
                            deadLetterQueueId: entry.id,
                            batchId: entry.batch_id,
                            newRetryCount: batchInfo.retry_count + 1
                        });
                        
                    } catch (error) {
                        results.failed++;
                        results.errors.push({
                            deadLetterQueueId: entry.id,
                            batchId: entry.batch_id,
                            error: error.message
                        });
                        
                        this.logger.error('Failed to retry item', {
                            deadLetterQueueId: entry.id,
                            batchId: entry.batch_id,
                            error: error.message
                        });
                    }
                }
                
                // If all retries failed, mark the overall operation as failed
                if (results.successful === 0 && results.failed > 0) {
                    results.success = false;
                }
            });
            
            this.logger.info('Retry process completed', {
                totalRequested: results.totalRequested,
                successful: results.successful,
                failed: results.failed,
                errors: results.errors.length
            });
            
            return results;
            
        } catch (error) {
            this.logger.error('Failed to retry failed items', {
                error: error.message,
                deadLetterQueueIds,
                userId
            });
            
            return {
                success: false,
                totalRequested: results.totalRequested,
                retryAttempts: results.retryAttempts,
                successful: results.successful,
                failed: results.failed,
                errors: [...results.errors, { error: error.message }]
            };
        }
    }
    
    /**
     * Mark items as reviewed
     * @param {Object} options - Options for marking items as reviewed
     * @param {Array<number>} options.deadLetterQueueIds - Array of dead letter queue IDs to mark as reviewed
     * @param {number} options.userId - User ID (for authorization - optional)
     * @returns {Promise<Object>} Result of the marking operation
     */
    async markItemsAsReviewed(options) {
        const { deadLetterQueueIds, userId = null } = options;
        
        if (!Array.isArray(deadLetterQueueIds) || deadLetterQueueIds.length === 0) {
            throw new Error('deadLetterQueueIds must be a non-empty array');
        }
        
        try {
            let query = knex('Bouncer_Dead_Letter_Queue')
                .whereIn('id', deadLetterQueueIds);
            
            // Apply user filter if provided
            if (userId) {
                query = query.where('user_id', userId);
            }
            
            const updatedRows = await query.update({ reviewed: true });
            
            this.logger.info('Items marked as reviewed', {
                requestedIds: deadLetterQueueIds.length,
                updatedRows,
                userId
            });
            
            return {
                success: true,
                totalRequested: deadLetterQueueIds.length,
                updatedRows,
                message: `Successfully marked ${updatedRows} items as reviewed`
            };
            
        } catch (error) {
            this.logger.error('Failed to mark items as reviewed', {
                error: error.message,
                deadLetterQueueIds,
                userId
            });
            
            throw new Error(`Failed to mark items as reviewed: ${error.message}`);
        }
    }
    
    /**
     * Get statistics about the dead letter queue
     * @param {Object} options - Options for getting statistics
     * @param {number} options.userId - Filter by user ID (optional)
     * @param {number} options.days - Number of days to look back (default: 30)
     * @returns {Promise<Object>} Statistics about the dead letter queue
     */
    async getStatistics(options = {}) {
        const { userId = null, days = 30 } = options;
        
        try {
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            let baseQuery = knex('Bouncer_Dead_Letter_Queue')
                .where('failed_ts', '>=', fromDate);
            
            if (userId) {
                baseQuery = baseQuery.where('user_id', userId);
            }
            
            // Get total counts
            const [totalCount] = await baseQuery.clone().count('* as total');
            const [reviewedCount] = await baseQuery.clone().where('reviewed', true).count('* as reviewed');
            const [unreviewedCount] = await baseQuery.clone().where('reviewed', false).count('* as unreviewed');
            
            // Get failure trends by day
            const failuresByDay = await baseQuery.clone()
                .select(knex.raw('DATE(failed_ts) as date'))
                .count('* as failures')
                .groupBy(knex.raw('DATE(failed_ts)'))
                .orderBy('date', 'desc')
                .limit(7); // Last 7 days
            
            // Get most common error patterns
            const errorPatterns = await baseQuery.clone()
                .select(knex.raw('LEFT(error_message, 100) as error_pattern'))
                .count('* as occurrences')
                .groupBy(knex.raw('LEFT(error_message, 100)'))
                .orderBy('occurrences', 'desc')
                .limit(10);
            
            // Get user breakdown if not filtering by user
            let userBreakdown = [];
            if (!userId) {
                userBreakdown = await baseQuery.clone()
                    .select('user_id')
                    .count('* as failures')
                    .groupBy('user_id')
                    .orderBy('failures', 'desc')
                    .limit(10);
            }
            
            const stats = {
                success: true,
                period: {
                    days,
                    fromDate: fromDate.toISOString(),
                    toDate: new Date().toISOString()
                },
                totals: {
                    total: parseInt(totalCount.total),
                    reviewed: parseInt(reviewedCount.reviewed),
                    unreviewed: parseInt(unreviewedCount.unreviewed),
                    reviewedPercentage: totalCount.total > 0 ? 
                        Math.round((reviewedCount.reviewed / totalCount.total) * 100) : 0
                },
                trends: {
                    failuresByDay: failuresByDay.map(row => ({
                        date: row.date,
                        failures: parseInt(row.failures)
                    }))
                },
                errorPatterns: errorPatterns.map(row => ({
                    pattern: row.error_pattern,
                    occurrences: parseInt(row.occurrences)
                })),
                userBreakdown: userBreakdown.map(row => ({
                    userId: row.user_id,
                    failures: parseInt(row.failures)
                }))
            };
            
            this.logger.debug('Retrieved dead letter queue statistics', {
                userId,
                days,
                totalFailures: stats.totals.total
            });
            
            return stats;
            
        } catch (error) {
            this.logger.error('Failed to retrieve dead letter queue statistics', {
                error: error.message,
                userId,
                days
            });
            
            throw new Error(`Failed to retrieve statistics: ${error.message}`);
        }
    }
    
    /**
     * Clean up old dead letter queue entries
     * @param {Object} options - Options for cleanup
     * @param {number} options.daysToKeep - Number of days to keep entries (default: 90)
     * @param {boolean} options.reviewedOnly - Only clean up reviewed items (default: true)
     * @param {number} options.batchSize - Number of items to delete per batch (default: 1000)
     * @returns {Promise<Object>} Result of the cleanup operation
     */
    async cleanupOldEntries(options = {}) {
        const { daysToKeep = 90, reviewedOnly = true, batchSize = 1000 } = options;
        
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            let totalDeleted = 0;
            let hasMore = true;
            
            this.logger.info('Starting dead letter queue cleanup', {
                cutoffDate: cutoffDate.toISOString(),
                daysToKeep,
                reviewedOnly,
                batchSize
            });
            
            while (hasMore) {
                let query = knex('Bouncer_Dead_Letter_Queue')
                    .where('failed_ts', '<', cutoffDate);
                
                if (reviewedOnly) {
                    query = query.where('reviewed', true);
                }
                
                const idsToDelete = await query
                    .select('id')
                    .limit(batchSize)
                    .pluck('id');
                
                if (idsToDelete.length === 0) {
                    hasMore = false;
                } else {
                    const deletedCount = await knex('Bouncer_Dead_Letter_Queue')
                        .whereIn('id', idsToDelete)
                        .del();
                    
                    totalDeleted += deletedCount;
                    
                    this.logger.debug('Deleted batch of old dead letter queue entries', {
                        batchSize: deletedCount,
                        totalDeleted
                    });
                    
                    // If we deleted fewer than the batch size, we're done
                    if (deletedCount < batchSize) {
                        hasMore = false;
                    }
                }
            }
            
            this.logger.info('Dead letter queue cleanup completed', {
                totalDeleted,
                cutoffDate: cutoffDate.toISOString(),
                reviewedOnly
            });
            
            return {
                success: true,
                totalDeleted,
                cutoffDate: cutoffDate.toISOString(),
                reviewedOnly,
                message: `Successfully cleaned up ${totalDeleted} old dead letter queue entries`
            };
            
        } catch (error) {
            this.logger.error('Failed to clean up old dead letter queue entries', {
                error: error.message,
                daysToKeep,
                reviewedOnly,
                batchSize
            });
            
            throw new Error(`Failed to clean up old entries: ${error.message}`);
        }
    }
    
    /**
     * Get health status of the dead letter queue
     * @returns {Promise<Object>} Health status information
     */
    async getHealthStatus() {
        try {
            const now = new Date();
            const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            // Get recent failure counts
            const [last24HCount] = await knex('Bouncer_Dead_Letter_Queue')
                .where('failed_ts', '>=', last24Hours)
                .count('* as count');
            
            const [last7DaysCount] = await knex('Bouncer_Dead_Letter_Queue')
                .where('failed_ts', '>=', last7Days)
                .count('* as count');
            
            const [totalUnreviewed] = await knex('Bouncer_Dead_Letter_Queue')
                .where('reviewed', false)
                .count('* as count');
            
            // Calculate health score based on failure rates
            const last24HFailures = parseInt(last24HCount.count);
            const last7DaysFailures = parseInt(last7DaysCount.count);
            const unreviewedItems = parseInt(totalUnreviewed.count);
            
            let healthScore = 100;
            let status = 'healthy';
            const issues = [];
            
            // Deduct points for high failure rates
            if (last24HFailures > 100) {
                healthScore -= 30;
                issues.push(`High failure rate in last 24 hours: ${last24HFailures}`);
            } else if (last24HFailures > 50) {
                healthScore -= 15;
                issues.push(`Moderate failure rate in last 24 hours: ${last24HFailures}`);
            }
            
            // Deduct points for unreviewed items
            if (unreviewedItems > 1000) {
                healthScore -= 40;
                issues.push(`Many unreviewed items: ${unreviewedItems}`);
            } else if (unreviewedItems > 500) {
                healthScore -= 20;
                issues.push(`Some unreviewed items: ${unreviewedItems}`);
            }
            
            // Determine overall status
            if (healthScore < 50) {
                status = 'critical';
            } else if (healthScore < 75) {
                status = 'warning';
            }
            
            const healthStatus = {
                status,
                score: healthScore,
                timestamp: now.toISOString(),
                metrics: {
                    last24HourFailures: last24HFailures,
                    last7DaysFailures: last7DaysFailures,
                    unreviewedItems: unreviewedItems
                },
                issues
            };
            
            this.logger.debug('Dead letter queue health check completed', {
                status,
                score: healthScore,
                issues: issues.length
            });
            
            return healthStatus;
            
        } catch (error) {
            this.logger.error('Failed to get dead letter queue health status', {
                error: error.message
            });
            
            return {
                status: 'error',
                score: 0,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

// Export the service class
module.exports = DeadLetterQueueService;

// Also export a default instance for convenience
module.exports.default = new DeadLetterQueueService();