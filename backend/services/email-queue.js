/**
 * Email Queue Service for Bouncer Email Verification System
 * 
 * This service provides high-level queue management operations for email verification
 * processing using the Bouncer API. It handles batch composition, optimization,
 * and lifecycle management of email queues.
 * 
 * Features:
 * - Batch processing of up to 10,000 emails per batch
 * - Maximum 15 concurrent batches
 * - Rate limiting compliance (200 requests/minute)
 * - Non-homogeneous batch composition for optimization
 * - Comprehensive error handling and logging
 * - Transaction support for data integrity
 */

const crypto = require('crypto');
const knex = require('knex')(require('../knexfile.js').development);

// Constants
const MAX_BATCH_SIZE = 10000;
const MAX_CONCURRENT_BATCHES = 15;
const PRIORITY_LEVELS = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25
};

const QUEUE_STATUS = {
    QUEUED: 'queued',
    ASSIGNED: 'assigned',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

const BATCH_STATUS = {
    QUEUED: 'queued',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DOWNLOADING: 'downloading'
};

class EmailQueueService {
    constructor() {
        this.logger = console; // Can be replaced with proper logging service
    }

    /**
     * Add emails to the queue for processing
     * @param {Array} emails - Array of email objects with { global_id, email }
     * @param {number} userId - User ID
     * @param {number} requestId - Request ID
     * @param {number} priority - Priority level (default: NORMAL)
     * @returns {Promise<Object>} Result object with success status and queue details
     */
    async addEmailsToQueue(emails, userId, requestId, priority = PRIORITY_LEVELS.NORMAL) {
        const startTime = Date.now();
        
        try {
            // Validate input parameters
            if (!emails || !Array.isArray(emails) || emails.length === 0) {
                throw new Error('Invalid emails array provided');
            }

            if (!userId || !requestId) {
                throw new Error('User ID and Request ID are required');
            }

            // Validate priority level
            if (!Object.values(PRIORITY_LEVELS).includes(priority)) {
                priority = PRIORITY_LEVELS.NORMAL;
            }

            this.logger.log(`Adding ${emails.length} emails to queue for user ${userId}, request ${requestId}`);

            // Prepare queue entries with domain hashing for optimization
            const queueEntries = emails.map(email => ({
                global_id: email.global_id,
                user_id: userId,
                request_id: requestId,
                status: QUEUE_STATUS.QUEUED,
                priority: priority,
                domain_hash: this._generateDomainHash(email.email),
                created_ts: new Date()
            }));

            // Insert into queue using transaction
            const result = await knex.transaction(async (trx) => {
                const insertedIds = await trx('Bouncer_Queue')
                    .insert(queueEntries)
                    .then(insertResult => insertResult);

                // Return summary
                return {
                    success: true,
                    queued_count: emails.length,
                    user_id: userId,
                    request_id: requestId,
                    priority: priority,
                    queue_ids: insertedIds,
                    processing_time: Date.now() - startTime
                };
            });

            this.logger.log(`Successfully queued ${result.queued_count} emails in ${result.processing_time}ms`);
            return result;

        } catch (error) {
            this.logger.error('Error adding emails to queue:', error);
            return {
                success: false,
                error: error.message,
                processing_time: Date.now() - startTime
            };
        }
    }

    /**
     * Get queued emails ready for batch processing
     * @param {number} batchSize - Maximum number of emails to retrieve (default: MAX_BATCH_SIZE)
     * @param {number} minPriority - Minimum priority level to include (default: 0)
     * @returns {Promise<Array>} Array of queued email objects
     */
    async getQueuedEmails(batchSize = MAX_BATCH_SIZE, minPriority = 0) {
        const startTime = Date.now();
        
        try {
            this.logger.log(`Retrieving queued emails (batch size: ${batchSize}, min priority: ${minPriority})`);

            // Get queued emails with priority ordering
            const queuedEmails = await knex('Bouncer_Queue as bq')
                .leftJoin('Contacts_Global as cg', 'bq.global_id', 'cg.global_id')
                .select([
                    'bq.queue_id',
                    'bq.global_id',
                    'bq.user_id',
                    'bq.request_id',
                    'bq.priority',
                    'bq.domain_hash',
                    'bq.created_ts',
                    'cg.email'
                ])
                .where('bq.status', QUEUE_STATUS.QUEUED)
                .where('bq.priority', '>=', minPriority)
                .orderBy('bq.priority', 'desc')
                .orderBy('bq.created_ts', 'asc')
                .limit(batchSize);

            this.logger.log(`Retrieved ${queuedEmails.length} queued emails in ${Date.now() - startTime}ms`);
            return queuedEmails;

        } catch (error) {
            this.logger.error('Error retrieving queued emails:', error);
            throw error;
        }
    }

    /**
     * Optimize batch composition for better performance
     * Implements non-homogeneous batch composition by interleaving emails from different domains
     * @param {Array} emails - Array of email objects
     * @returns {Promise<Array>} Optimized batch of emails
     */
    async optimizeBatchComposition(emails) {
        const startTime = Date.now();
        
        try {
            if (!emails || emails.length === 0) {
                return [];
            }

            this.logger.log(`Optimizing batch composition for ${emails.length} emails`);

            // Group emails by domain hash for optimization
            const domainGroups = {};
            
            emails.forEach(email => {
                const domainHash = email.domain_hash || this._generateDomainHash(email.email);
                if (!domainGroups[domainHash]) {
                    domainGroups[domainHash] = [];
                }
                domainGroups[domainHash].push(email);
            });

            // Interleave emails from different domains for better processing
            const optimizedBatch = [];
            const domainHashes = Object.keys(domainGroups);
            let roundRobinIndex = 0;

            while (optimizedBatch.length < emails.length) {
                let added = false;
                
                // Round-robin through domains
                for (let i = 0; i < domainHashes.length; i++) {
                    const domainHash = domainHashes[(roundRobinIndex + i) % domainHashes.length];
                    
                    if (domainGroups[domainHash] && domainGroups[domainHash].length > 0) {
                        optimizedBatch.push(domainGroups[domainHash].shift());
                        added = true;
                    }
                }

                if (!added) {
                    break; // No more emails to add
                }
                
                roundRobinIndex++;
            }

            // Add metadata about optimization
            const domainCount = domainHashes.length;
            const averageEmailsPerDomain = emails.length / domainCount;
            
            this.logger.log(`Batch optimization completed in ${Date.now() - startTime}ms`);
            this.logger.log(`Domain diversity: ${domainCount} domains, avg ${averageEmailsPerDomain.toFixed(2)} emails/domain`);

            return optimizedBatch;

        } catch (error) {
            this.logger.error('Error optimizing batch composition:', error);
            throw error;
        }
    }

    /**
     * Update contact verification results
     * @param {number} batchId - Batch ID
     * @param {Array} results - Array of verification results from Bouncer API
     * @returns {Promise<Object>} Update result summary
     */
    async updateContactResults(batchId, results) {
        const startTime = Date.now();
        
        try {
            if (!batchId || !results || !Array.isArray(results)) {
                throw new Error('Invalid batch ID or results provided');
            }

            this.logger.log(`Updating contact results for batch ${batchId} with ${results.length} results`);

            // Update contact results and queue status in transaction
            const result = await knex.transaction(async (trx) => {
                let updatedContacts = 0;
                let updatedQueueItems = 0;
                let insertedResults = 0;

                // Process each result
                for (const result of results) {
                    const { email, status, reason, score, provider, toxic, toxicity, ...additionalData } = result;

                    // Find the global_id for this email
                    const contact = await trx('Contacts_Global')
                        .where('email', email)
                        .select('global_id')
                        .first();

                    if (!contact) {
                        this.logger.warn(`Contact not found for email: ${email}`);
                        continue;
                    }

                    // Update Contacts_Global with latest verification result
                    await trx('Contacts_Global')
                        .where('global_id', contact.global_id)
                        .update({
                            bouncer_status: status,
                            bouncer_reason: reason,
                            bouncer_score: score,
                            bouncer_provider: provider,
                            bouncer_toxic: toxic,
                            bouncer_toxicity: toxicity,
                            last_verified_ts: new Date(),
                            updated_ts: new Date()
                        });
                    updatedContacts++;

                    // Insert detailed results
                    await trx('Bouncer_Results')
                        .insert({
                            batch_id: batchId,
                            global_id: contact.global_id,
                            bouncer_status: status,
                            bouncer_reason: reason,
                            domain_info: additionalData.domain_info ? JSON.stringify(additionalData.domain_info) : null,
                            account_info: additionalData.account_info ? JSON.stringify(additionalData.account_info) : null,
                            dns_info: additionalData.dns_info ? JSON.stringify(additionalData.dns_info) : null,
                            provider: provider,
                            score: score,
                            toxic: toxic,
                            toxicity: toxicity,
                            processed_ts: new Date()
                        })
                        .onConflict(['batch_id', 'global_id'])
                        .merge();
                    insertedResults++;

                    // Update queue item status
                    await trx('Bouncer_Queue')
                        .where('global_id', contact.global_id)
                        .where('batch_id', batchId)
                        .update({
                            status: QUEUE_STATUS.COMPLETED,
                            completed_ts: new Date()
                        });
                    updatedQueueItems++;
                }

                return {
                    success: true,
                    batch_id: batchId,
                    updated_contacts: updatedContacts,
                    updated_queue_items: updatedQueueItems,
                    inserted_results: insertedResults,
                    processing_time: Date.now() - startTime
                };
            });

            this.logger.log(`Contact results updated successfully for batch ${batchId} in ${result.processing_time}ms`);
            return result;

        } catch (error) {
            this.logger.error('Error updating contact results:', error);
            throw error;
        }
    }

    /**
     * Get count of active batches
     * @returns {Promise<number>} Number of active batches
     */
    async getActiveBatchCount() {
        try {
            const result = await knex('Bouncer_Batches')
                .whereIn('status', [BATCH_STATUS.QUEUED, BATCH_STATUS.PROCESSING, BATCH_STATUS.DOWNLOADING])
                .count('* as count')
                .first();

            const activeBatches = result ? result.count : 0;
            this.logger.log(`Active batches: ${activeBatches}/${MAX_CONCURRENT_BATCHES}`);
            
            return activeBatches;

        } catch (error) {
            this.logger.error('Error getting active batch count:', error);
            throw error;
        }
    }

    /**
     * Get queue statistics
     * @returns {Promise<Object>} Queue statistics
     */
    async getQueueStats() {
        try {
            const stats = await knex('Bouncer_Queue')
                .select(
                    knex.raw('COUNT(*) as total_items'),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as queued_items', [QUEUE_STATUS.QUEUED]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as assigned_items', [QUEUE_STATUS.ASSIGNED]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed_items', [QUEUE_STATUS.COMPLETED]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as failed_items', [QUEUE_STATUS.FAILED]),
                    knex.raw('AVG(priority) as avg_priority')
                )
                .first();

            // Get batch statistics
            const batchStats = await knex('Bouncer_Batches')
                .select(
                    knex.raw('COUNT(*) as total_batches'),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as queued_batches', [BATCH_STATUS.QUEUED]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as processing_batches', [BATCH_STATUS.PROCESSING]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed_batches', [BATCH_STATUS.COMPLETED]),
                    knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as failed_batches', [BATCH_STATUS.FAILED])
                )
                .first();

            return {
                queue: {
                    total_items: parseInt(stats.total_items) || 0,
                    queued_items: parseInt(stats.queued_items) || 0,
                    assigned_items: parseInt(stats.assigned_items) || 0,
                    completed_items: parseInt(stats.completed_items) || 0,
                    failed_items: parseInt(stats.failed_items) || 0,
                    avg_priority: parseFloat(stats.avg_priority) || 0
                },
                batches: {
                    total_batches: parseInt(batchStats.total_batches) || 0,
                    queued_batches: parseInt(batchStats.queued_batches) || 0,
                    processing_batches: parseInt(batchStats.processing_batches) || 0,
                    completed_batches: parseInt(batchStats.completed_batches) || 0,
                    failed_batches: parseInt(batchStats.failed_batches) || 0,
                    active_batches: (parseInt(batchStats.queued_batches) || 0) + 
                                   (parseInt(batchStats.processing_batches) || 0),
                    max_concurrent_batches: MAX_CONCURRENT_BATCHES
                }
            };

        } catch (error) {
            this.logger.error('Error getting queue statistics:', error);
            throw error;
        }
    }

    /**
     * Mark queue items as assigned to a batch
     * @param {Array} queueIds - Array of queue IDs to assign
     * @param {number} batchId - Batch ID to assign to
     * @returns {Promise<Object>} Assignment result
     */
    async assignQueueItemsToBatch(queueIds, batchId) {
        const startTime = Date.now();
        
        try {
            if (!queueIds || !Array.isArray(queueIds) || queueIds.length === 0) {
                throw new Error('Invalid queue IDs provided');
            }

            if (!batchId) {
                throw new Error('Batch ID is required');
            }

            this.logger.log(`Assigning ${queueIds.length} queue items to batch ${batchId}`);

            const result = await knex.transaction(async (trx) => {
                const updatedCount = await trx('Bouncer_Queue')
                    .whereIn('queue_id', queueIds)
                    .where('status', QUEUE_STATUS.QUEUED)
                    .update({
                        batch_id: batchId,
                        status: QUEUE_STATUS.ASSIGNED,
                        assigned_ts: new Date()
                    });

                return {
                    success: true,
                    batch_id: batchId,
                    requested_items: queueIds.length,
                    assigned_items: updatedCount,
                    processing_time: Date.now() - startTime
                };
            });

            this.logger.log(`Successfully assigned ${result.assigned_items} items to batch ${batchId} in ${result.processing_time}ms`);
            return result;

        } catch (error) {
            this.logger.error('Error assigning queue items to batch:', error);
            throw error;
        }
    }

    /**
     * Get queue items by batch ID
     * @param {number} batchId - Batch ID
     * @returns {Promise<Array>} Array of queue items
     */
    async getQueueItemsByBatch(batchId) {
        try {
            if (!batchId) {
                throw new Error('Batch ID is required');
            }

            const queueItems = await knex('Bouncer_Queue as bq')
                .leftJoin('Contacts_Global as cg', 'bq.global_id', 'cg.global_id')
                .select([
                    'bq.queue_id',
                    'bq.global_id',
                    'bq.user_id',
                    'bq.request_id',
                    'bq.status',
                    'bq.priority',
                    'bq.created_ts',
                    'bq.assigned_ts',
                    'bq.completed_ts',
                    'cg.email'
                ])
                .where('bq.batch_id', batchId)
                .orderBy('bq.created_ts', 'asc');

            return queueItems;

        } catch (error) {
            this.logger.error('Error getting queue items by batch:', error);
            throw error;
        }
    }

    /**
     * Clean up old completed queue items
     * @param {number} daysOld - Number of days old to consider for cleanup (default: 30)
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupOldQueueItems(daysOld = 30) {
        const startTime = Date.now();
        
        try {
            this.logger.log(`Cleaning up queue items older than ${daysOld} days`);

            const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
            
            const deletedCount = await knex('Bouncer_Queue')
                .where('status', QUEUE_STATUS.COMPLETED)
                .where('completed_ts', '<', cutoffDate)
                .del();

            const result = {
                success: true,
                deleted_items: deletedCount,
                cutoff_date: cutoffDate,
                processing_time: Date.now() - startTime
            };

            this.logger.log(`Cleaned up ${deletedCount} old queue items in ${result.processing_time}ms`);
            return result;

        } catch (error) {
            this.logger.error('Error cleaning up old queue items:', error);
            throw error;
        }
    }

    /**
     * Generate domain hash for optimization
     * @param {string} email - Email address
     * @returns {string} Domain hash
     * @private
     */
    _generateDomainHash(email) {
        try {
            if (!email || typeof email !== 'string') {
                return null;
            }

            const domain = email.split('@')[1];
            if (!domain) {
                return null;
            }

            // Generate SHA-256 hash of domain for grouping
            return crypto.createHash('sha256').update(domain.toLowerCase()).digest('hex');

        } catch (error) {
            this.logger.error('Error generating domain hash:', error);
            return null;
        }
    }

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean} Whether email format is valid
     * @private
     */
    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Get health status of the queue service
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        try {
            const stats = await this.getQueueStats();
            const activeBatches = await this.getActiveBatchCount();
            
            // Calculate health metrics
            const queueBacklog = stats.queue.queued_items;
            const totalItems = stats.queue.total_items;
            const processingRate = stats.queue.completed_items / Math.max(totalItems, 1);
            
            const isHealthy = queueBacklog < 100000 && // Queue backlog threshold
                            activeBatches < MAX_CONCURRENT_BATCHES &&
                            processingRate > 0.8; // 80% success rate

            return {
                status: isHealthy ? 'healthy' : 'degraded',
                timestamp: new Date(),
                metrics: {
                    queue_backlog: queueBacklog,
                    active_batches: activeBatches,
                    max_concurrent_batches: MAX_CONCURRENT_BATCHES,
                    processing_rate: processingRate,
                    queue_utilization: (queueBacklog / 100000) * 100
                },
                queue_stats: stats
            };

        } catch (error) {
            this.logger.error('Error getting health status:', error);
            return {
                status: 'unhealthy',
                timestamp: new Date(),
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new EmailQueueService();