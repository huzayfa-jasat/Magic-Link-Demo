/**
 * Bouncer Database Service
 * 
 * This service provides all database operations for Bouncer email verification system.
 * It handles batch operations, queue management, rate limiting, and result storage.
 * 
 * Database Tables:
 * - Bouncer_Batches: Batch tracking and status
 * - Bouncer_Queue: Email queue management
 * - Bouncer_Rate_Limit: API rate limiting
 * - Bouncer_Results: Detailed verification results
 * - Bouncer_Dead_Letter_Queue: Failed items tracking
 * - Bouncer_Health_Metrics: System health monitoring
 */

const knex = require('knex')(require('../knexfile.js').development);
const crypto = require('crypto');

/**
 * Custom error class for Bouncer database operations
 */
class BouncerDbError extends Error {
  constructor(message, code = 'BOUNCER_DB_ERROR', details = {}) {
    super(message);
    this.name = 'BouncerDbError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Logger utility for consistent logging
 */
const logger = {
  info: (message, data = {}) => console.log(`[BOUNCER-DB] INFO: ${message}`, data),
  warn: (message, data = {}) => console.warn(`[BOUNCER-DB] WARN: ${message}`, data),
  error: (message, error = {}) => console.error(`[BOUNCER-DB] ERROR: ${message}`, error),
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BOUNCER-DB] DEBUG: ${message}`, data);
    }
  }
};

/**
 * Input validation helpers
 */
const validate = {
  required: (value, name) => {
    if (value === null || value === undefined) {
      throw new BouncerDbError(`${name} is required`, 'VALIDATION_ERROR');
    }
  },
  
  email: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BouncerDbError('Invalid email format', 'VALIDATION_ERROR');
    }
  },
  
  positiveInteger: (value, name) => {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BouncerDbError(`${name} must be a positive integer`, 'VALIDATION_ERROR');
    }
  },
  
  batchStatus: (status) => {
    const validStatuses = ['queued', 'processing', 'completed', 'failed', 'downloading'];
    if (!validStatuses.includes(status)) {
      throw new BouncerDbError(`Invalid batch status: ${status}`, 'VALIDATION_ERROR');
    }
  },
  
  queueStatus: (status) => {
    const validStatuses = ['queued', 'assigned', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new BouncerDbError(`Invalid queue status: ${status}`, 'VALIDATION_ERROR');
    }
  }
};

/**
 * Generate domain hash for optimization
 */
function generateDomainHash(email) {
  const domain = email.split('@')[1];
  return crypto.createHash('md5').update(domain).digest('hex');
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Create a new Bouncer batch
 * @param {string} batchId - Bouncer API batch ID
 * @param {number} userId - User ID
 * @param {number} requestId - Request ID
 * @param {number} quantity - Number of emails in batch
 * @param {number} duplicates - Number of duplicate emails
 * @returns {Promise<number>} Created batch ID
 */
async function createBatch(batchId, userId, requestId, quantity, duplicates = 0) {
  try {
    validate.required(batchId, 'batchId');
    validate.positiveInteger(userId, 'userId');
    validate.positiveInteger(requestId, 'requestId');
    validate.positiveInteger(quantity, 'quantity');

    logger.info('Creating new batch', { batchId, userId, requestId, quantity, duplicates });

    const [id] = await knex('Bouncer_Batches').insert({
      batch_id: batchId,
      user_id: userId,
      request_id: requestId,
      status: 'queued',
      quantity: quantity,
      duplicates: duplicates,
      retry_count: 0
    });

    logger.info('Batch created successfully', { id, batchId });
    return id;
  } catch (error) {
    logger.error('Failed to create batch', { error: error.message, batchId, userId, requestId });
    throw new BouncerDbError('Failed to create batch', 'CREATE_BATCH_ERROR', { originalError: error });
  }
}

/**
 * Get batch information by ID
 * @param {number} id - Internal batch ID
 * @returns {Promise<Object|null>} Batch information or null if not found
 */
async function getBatchById(id) {
  try {
    validate.positiveInteger(id, 'id');

    const batch = await knex('Bouncer_Batches')
      .where('id', id)
      .first();

    return batch || null;
  } catch (error) {
    logger.error('Failed to get batch by ID', { error: error.message, id });
    throw new BouncerDbError('Failed to get batch', 'GET_BATCH_ERROR', { originalError: error });
  }
}

/**
 * Get batch information by Bouncer API batch ID
 * @param {string} batchId - Bouncer API batch ID
 * @returns {Promise<Object|null>} Batch information or null if not found
 */
async function getBatchByBouncerId(batchId) {
  try {
    validate.required(batchId, 'batchId');

    const batch = await knex('Bouncer_Batches')
      .where('batch_id', batchId)
      .first();

    return batch || null;
  } catch (error) {
    logger.error('Failed to get batch by Bouncer ID', { error: error.message, batchId });
    throw new BouncerDbError('Failed to get batch', 'GET_BATCH_ERROR', { originalError: error });
  }
}

/**
 * Update batch status
 * @param {number} id - Internal batch ID
 * @param {string} status - New status
 * @param {string} errorMessage - Optional error message
 * @returns {Promise<boolean>} Success status
 */
async function updateBatchStatus(id, status, errorMessage = null) {
  try {
    validate.positiveInteger(id, 'id');
    validate.batchStatus(status);

    logger.info('Updating batch status', { id, status, errorMessage });

    const updateData = {
      status: status,
      updated_ts: knex.fn.now()
    };

    if (status === 'completed') {
      updateData.completed_ts = knex.fn.now();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const updated = await knex('Bouncer_Batches')
      .where('id', id)
      .update(updateData);

    if (updated === 0) {
      throw new BouncerDbError('Batch not found', 'BATCH_NOT_FOUND');
    }

    logger.info('Batch status updated successfully', { id, status });
    return true;
  } catch (error) {
    logger.error('Failed to update batch status', { error: error.message, id, status });
    throw new BouncerDbError('Failed to update batch status', 'UPDATE_BATCH_ERROR', { originalError: error });
  }
}

/**
 * Increment batch retry count
 * @param {number} id - Internal batch ID
 * @returns {Promise<number>} New retry count
 */
async function incrementBatchRetryCount(id) {
  try {
    validate.positiveInteger(id, 'id');

    const [updated] = await knex('Bouncer_Batches')
      .where('id', id)
      .increment('retry_count', 1)
      .returning('retry_count');

    if (!updated) {
      throw new BouncerDbError('Batch not found', 'BATCH_NOT_FOUND');
    }

    logger.info('Batch retry count incremented', { id, retryCount: updated.retry_count });
    return updated.retry_count;
  } catch (error) {
    logger.error('Failed to increment batch retry count', { error: error.message, id });
    throw new BouncerDbError('Failed to increment retry count', 'INCREMENT_RETRY_ERROR', { originalError: error });
  }
}

/**
 * Get active batch count (queued, processing, downloading)
 * @returns {Promise<number>} Number of active batches
 */
async function getActiveBatchCount() {
  try {
    const result = await knex('Bouncer_Batches')
      .whereIn('status', ['queued', 'processing', 'downloading'])
      .count('* as count')
      .first();

    return parseInt(result.count);
  } catch (error) {
    logger.error('Failed to get active batch count', { error: error.message });
    throw new BouncerDbError('Failed to get active batch count', 'GET_ACTIVE_BATCH_COUNT_ERROR', { originalError: error });
  }
}

/**
 * Get batches by status
 * @param {string} status - Batch status
 * @param {number} limit - Maximum number of batches to return
 * @returns {Promise<Array>} Array of batches
 */
async function getBatchesByStatus(status, limit = 50) {
  try {
    validate.batchStatus(status);
    validate.positiveInteger(limit, 'limit');

    const batches = await knex('Bouncer_Batches')
      .where('status', status)
      .orderBy('created_ts', 'asc')
      .limit(limit);

    return batches;
  } catch (error) {
    logger.error('Failed to get batches by status', { error: error.message, status });
    throw new BouncerDbError('Failed to get batches by status', 'GET_BATCHES_ERROR', { originalError: error });
  }
}

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

/**
 * Add emails to the queue
 * @param {Array} emails - Array of email objects with { email, globalId, userId, requestId }
 * @param {number} priority - Queue priority (default: 0)
 * @returns {Promise<Array>} Array of created queue IDs
 */
async function addEmailsToQueue(emails, priority = 0) {
  try {
    validate.required(emails, 'emails');
    
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new BouncerDbError('Emails must be a non-empty array', 'VALIDATION_ERROR');
    }

    logger.info('Adding emails to queue', { count: emails.length, priority });

    const queueItems = emails.map(email => {
      validate.email(email.email);
      validate.positiveInteger(email.globalId, 'globalId');
      validate.positiveInteger(email.userId, 'userId');
      validate.positiveInteger(email.requestId, 'requestId');

      return {
        global_id: email.globalId,
        user_id: email.userId,
        request_id: email.requestId,
        status: 'queued',
        priority: priority,
        domain_hash: generateDomainHash(email.email)
      };
    });

    const ids = await knex('Bouncer_Queue').insert(queueItems);
    
    logger.info('Emails added to queue successfully', { count: ids.length });
    return ids;
  } catch (error) {
    logger.error('Failed to add emails to queue', { error: error.message, emailCount: emails?.length });
    throw new BouncerDbError('Failed to add emails to queue', 'ADD_QUEUE_ERROR', { originalError: error });
  }
}

/**
 * Get queued emails for batch processing
 * @param {number} batchSize - Maximum number of emails to retrieve
 * @param {Array} domainHashes - Optional array of domain hashes to prioritize
 * @returns {Promise<Array>} Array of queued emails
 */
async function getQueuedEmails(batchSize, domainHashes = []) {
  try {
    validate.positiveInteger(batchSize, 'batchSize');

    let query = knex('Bouncer_Queue')
      .join('Contacts_Global', 'Bouncer_Queue.global_id', 'Contacts_Global.global_id')
      .where('Bouncer_Queue.status', 'queued')
      .select(
        'Bouncer_Queue.queue_id',
        'Bouncer_Queue.global_id',
        'Bouncer_Queue.user_id',
        'Bouncer_Queue.request_id',
        'Bouncer_Queue.priority',
        'Bouncer_Queue.domain_hash',
        'Contacts_Global.email'
      )
      .orderBy('Bouncer_Queue.priority', 'desc')
      .orderBy('Bouncer_Queue.created_ts', 'asc')
      .limit(batchSize);

    // Prioritize specific domain hashes if provided
    if (domainHashes.length > 0) {
      query = query.whereIn('Bouncer_Queue.domain_hash', domainHashes);
    }

    const emails = await query;
    
    logger.debug('Retrieved queued emails', { count: emails.length, batchSize });
    return emails;
  } catch (error) {
    logger.error('Failed to get queued emails', { error: error.message, batchSize });
    throw new BouncerDbError('Failed to get queued emails', 'GET_QUEUED_EMAILS_ERROR', { originalError: error });
  }
}

/**
 * Assign queue items to a batch
 * @param {Array} queueIds - Array of queue IDs
 * @param {number} batchId - Internal batch ID
 * @returns {Promise<boolean>} Success status
 */
async function assignQueueItemsToBatch(queueIds, batchId) {
  try {
    validate.required(queueIds, 'queueIds');
    validate.positiveInteger(batchId, 'batchId');

    if (!Array.isArray(queueIds) || queueIds.length === 0) {
      throw new BouncerDbError('Queue IDs must be a non-empty array', 'VALIDATION_ERROR');
    }

    logger.info('Assigning queue items to batch', { queueIds: queueIds.length, batchId });

    const updated = await knex('Bouncer_Queue')
      .whereIn('queue_id', queueIds)
      .where('status', 'queued')
      .update({
        batch_id: batchId,
        status: 'assigned',
        assigned_ts: knex.fn.now()
      });

    if (updated === 0) {
      throw new BouncerDbError('No queue items were assigned', 'ASSIGN_QUEUE_ERROR');
    }

    logger.info('Queue items assigned successfully', { assigned: updated, batchId });
    return true;
  } catch (error) {
    logger.error('Failed to assign queue items to batch', { error: error.message, queueIds: queueIds?.length, batchId });
    throw new BouncerDbError('Failed to assign queue items', 'ASSIGN_QUEUE_ERROR', { originalError: error });
  }
}

/**
 * Update queue item status
 * @param {Array} queueIds - Array of queue IDs
 * @param {string} status - New status
 * @returns {Promise<boolean>} Success status
 */
async function updateQueueItemStatus(queueIds, status) {
  try {
    validate.required(queueIds, 'queueIds');
    validate.queueStatus(status);

    if (!Array.isArray(queueIds) || queueIds.length === 0) {
      throw new BouncerDbError('Queue IDs must be a non-empty array', 'VALIDATION_ERROR');
    }

    logger.info('Updating queue item status', { queueIds: queueIds.length, status });

    const updateData = { status: status };
    if (status === 'completed') {
      updateData.completed_ts = knex.fn.now();
    }

    const updated = await knex('Bouncer_Queue')
      .whereIn('queue_id', queueIds)
      .update(updateData);

    logger.info('Queue item status updated', { updated, status });
    return true;
  } catch (error) {
    logger.error('Failed to update queue item status', { error: error.message, queueIds: queueIds?.length, status });
    throw new BouncerDbError('Failed to update queue item status', 'UPDATE_QUEUE_STATUS_ERROR', { originalError: error });
  }
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue statistics
 */
async function getQueueStats() {
  try {
    const stats = await knex('Bouncer_Queue')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const result = {
      queued: 0,
      assigned: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    stats.forEach(stat => {
      result[stat.status] = parseInt(stat.count);
      result.total += parseInt(stat.count);
    });

    return result;
  } catch (error) {
    logger.error('Failed to get queue stats', { error: error.message });
    throw new BouncerDbError('Failed to get queue stats', 'GET_QUEUE_STATS_ERROR', { originalError: error });
  }
}

/**
 * Get domain distribution in queue
 * @param {number} limit - Maximum number of domains to return
 * @returns {Promise<Array>} Array of domain statistics
 */
async function getDomainDistribution(limit = 20) {
  try {
    validate.positiveInteger(limit, 'limit');

    const distribution = await knex('Bouncer_Queue')
      .where('status', 'queued')
      .select('domain_hash')
      .count('* as count')
      .groupBy('domain_hash')
      .orderBy('count', 'desc')
      .limit(limit);

    return distribution;
  } catch (error) {
    logger.error('Failed to get domain distribution', { error: error.message });
    throw new BouncerDbError('Failed to get domain distribution', 'GET_DOMAIN_DISTRIBUTION_ERROR', { originalError: error });
  }
}

// =============================================================================
// RATE LIMITING OPERATIONS
// =============================================================================

/**
 * Record an API call for rate limiting
 * @returns {Promise<boolean>} Success status
 */
async function recordApiCall() {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60000); // 1 minute window

    await knex('Bouncer_Rate_Limit').insert({
      request_count: 1,
      window_start_ts: now,
      window_end_ts: windowEnd
    });

    logger.debug('API call recorded for rate limiting');
    return true;
  } catch (error) {
    logger.error('Failed to record API call', { error: error.message });
    throw new BouncerDbError('Failed to record API call', 'RECORD_API_CALL_ERROR', { originalError: error });
  }
}

/**
 * Check if we can make an API call within rate limits
 * @param {number} maxRequests - Maximum requests per minute (default: 180)
 * @returns {Promise<boolean>} Whether API call can be made
 */
async function canMakeApiCall(maxRequests = 180) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60000); // 1 minute ago

    const result = await knex('Bouncer_Rate_Limit')
      .where('window_start_ts', '>=', windowStart)
      .count('* as count')
      .first();

    const currentCount = parseInt(result.count);
    const canMake = currentCount < maxRequests;

    logger.debug('Rate limit check', { currentCount, maxRequests, canMake });
    return canMake;
  } catch (error) {
    logger.error('Failed to check rate limit', { error: error.message });
    throw new BouncerDbError('Failed to check rate limit', 'CHECK_RATE_LIMIT_ERROR', { originalError: error });
  }
}

/**
 * Get next available time for API call
 * @param {number} maxRequests - Maximum requests per minute
 * @returns {Promise<Date>} Next available time
 */
async function getNextAvailableTime(maxRequests = 180) {
  try {
    const oldestRequest = await knex('Bouncer_Rate_Limit')
      .select('window_start_ts')
      .orderBy('window_start_ts', 'asc')
      .limit(1)
      .offset(maxRequests - 1)
      .first();

    if (!oldestRequest) {
      return new Date(); // Can make request now
    }

    const nextAvailable = new Date(oldestRequest.window_start_ts.getTime() + 60000);
    return nextAvailable;
  } catch (error) {
    logger.error('Failed to get next available time', { error: error.message });
    throw new BouncerDbError('Failed to get next available time', 'GET_NEXT_AVAILABLE_TIME_ERROR', { originalError: error });
  }
}

/**
 * Clean up old rate limit records
 * @param {number} olderThanMinutes - Delete records older than this many minutes
 * @returns {Promise<number>} Number of records deleted
 */
async function cleanupRateLimitRecords(olderThanMinutes = 60) {
  try {
    const cutoff = new Date(Date.now() - (olderThanMinutes * 60 * 1000));

    const deleted = await knex('Bouncer_Rate_Limit')
      .where('window_start_ts', '<', cutoff)
      .del();

    logger.info('Rate limit records cleaned up', { deleted, olderThanMinutes });
    return deleted;
  } catch (error) {
    logger.error('Failed to cleanup rate limit records', { error: error.message });
    throw new BouncerDbError('Failed to cleanup rate limit records', 'CLEANUP_RATE_LIMIT_ERROR', { originalError: error });
  }
}

// =============================================================================
// RESULTS OPERATIONS
// =============================================================================

/**
 * Store detailed batch results
 * @param {number} batchId - Internal batch ID
 * @param {Array} results - Array of result objects
 * @returns {Promise<boolean>} Success status
 */
async function storeBatchResults(batchId, results) {
  try {
    validate.positiveInteger(batchId, 'batchId');
    validate.required(results, 'results');

    if (!Array.isArray(results) || results.length === 0) {
      logger.warn('No results to store', { batchId });
      return true;
    }

    logger.info('Storing batch results', { batchId, resultCount: results.length });

    // Use transaction to ensure data consistency
    await knex.transaction(async (trx) => {
      // Prepare result records
      const resultRecords = results.map(result => ({
        batch_id: batchId,
        global_id: result.global_id,
        bouncer_status: result.status,
        bouncer_reason: result.reason,
        domain_info: result.domain_info ? JSON.stringify(result.domain_info) : null,
        account_info: result.account_info ? JSON.stringify(result.account_info) : null,
        dns_info: result.dns_info ? JSON.stringify(result.dns_info) : null,
        provider: result.provider,
        score: result.score,
        toxic: result.toxic,
        toxicity: result.toxicity
      }));

      // Insert results
      await trx('Bouncer_Results').insert(resultRecords);

      // Update Contacts_Global with latest results
      for (const result of results) {
        await trx('Contacts_Global')
          .where('global_id', result.global_id)
          .update({
            latest_result: result.status,
            last_mail_server: result.provider,
            last_processed_ts: knex.fn.now()
          });
      }
    });

    logger.info('Batch results stored successfully', { batchId, resultCount: results.length });
    return true;
  } catch (error) {
    logger.error('Failed to store batch results', { error: error.message, batchId, resultCount: results?.length });
    throw new BouncerDbError('Failed to store batch results', 'STORE_RESULTS_ERROR', { originalError: error });
  }
}

/**
 * Get batch results
 * @param {number} batchId - Internal batch ID
 * @param {number} limit - Maximum number of results to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of results
 */
async function getBatchResults(batchId, limit = 1000, offset = 0) {
  try {
    validate.positiveInteger(batchId, 'batchId');
    validate.positiveInteger(limit, 'limit');

    const results = await knex('Bouncer_Results')
      .join('Contacts_Global', 'Bouncer_Results.global_id', 'Contacts_Global.global_id')
      .where('Bouncer_Results.batch_id', batchId)
      .select(
        'Bouncer_Results.*',
        'Contacts_Global.email'
      )
      .orderBy('Bouncer_Results.processed_ts', 'asc')
      .limit(limit)
      .offset(offset);

    // Parse JSON fields
    results.forEach(result => {
      if (result.domain_info) {
        result.domain_info = JSON.parse(result.domain_info);
      }
      if (result.account_info) {
        result.account_info = JSON.parse(result.account_info);
      }
      if (result.dns_info) {
        result.dns_info = JSON.parse(result.dns_info);
      }
    });

    return results;
  } catch (error) {
    logger.error('Failed to get batch results', { error: error.message, batchId });
    throw new BouncerDbError('Failed to get batch results', 'GET_BATCH_RESULTS_ERROR', { originalError: error });
  }
}

/**
 * Get result statistics for a batch
 * @param {number} batchId - Internal batch ID
 * @returns {Promise<Object>} Result statistics
 */
async function getBatchResultStats(batchId) {
  try {
    validate.positiveInteger(batchId, 'batchId');

    const stats = await knex('Bouncer_Results')
      .where('batch_id', batchId)
      .select('bouncer_status')
      .count('* as count')
      .groupBy('bouncer_status');

    const result = {
      total: 0,
      deliverable: 0,
      undeliverable: 0,
      catch_all: 0,
      unknown: 0
    };

    stats.forEach(stat => {
      const status = stat.bouncer_status;
      const count = parseInt(stat.count);
      result.total += count;
      
      if (status === 'deliverable') {
        result.deliverable = count;
      } else if (status === 'undeliverable') {
        result.undeliverable = count;
      } else if (status === 'catch-all') {
        result.catch_all = count;
      } else {
        result.unknown += count;
      }
    });

    return result;
  } catch (error) {
    logger.error('Failed to get batch result stats', { error: error.message, batchId });
    throw new BouncerDbError('Failed to get batch result stats', 'GET_BATCH_RESULT_STATS_ERROR', { originalError: error });
  }
}

// =============================================================================
// DEAD LETTER QUEUE OPERATIONS
// =============================================================================

/**
 * Add item to dead letter queue
 * @param {number} batchId - Internal batch ID
 * @param {number} userId - User ID
 * @param {number} requestId - Request ID
 * @param {string} errorMessage - Error message
 * @returns {Promise<number>} Dead letter queue ID
 */
async function addToDeadLetterQueue(batchId, userId, requestId, errorMessage) {
  try {
    validate.positiveInteger(batchId, 'batchId');
    validate.positiveInteger(userId, 'userId');
    validate.positiveInteger(requestId, 'requestId');
    validate.required(errorMessage, 'errorMessage');

    logger.info('Adding item to dead letter queue', { batchId, userId, requestId, errorMessage });

    const [id] = await knex('Bouncer_Dead_Letter_Queue').insert({
      batch_id: batchId,
      user_id: userId,
      request_id: requestId,
      error_message: errorMessage,
      reviewed: false
    });

    logger.info('Item added to dead letter queue', { id, batchId });
    return id;
  } catch (error) {
    logger.error('Failed to add item to dead letter queue', { error: error.message, batchId, userId, requestId });
    throw new BouncerDbError('Failed to add to dead letter queue', 'ADD_DEAD_LETTER_ERROR', { originalError: error });
  }
}

/**
 * Get unreviewed dead letter queue items
 * @param {number} limit - Maximum number of items to return
 * @returns {Promise<Array>} Array of dead letter queue items
 */
async function getUnreviewedDeadLetterItems(limit = 50) {
  try {
    validate.positiveInteger(limit, 'limit');

    const items = await knex('Bouncer_Dead_Letter_Queue')
      .where('reviewed', false)
      .orderBy('failed_ts', 'asc')
      .limit(limit);

    return items;
  } catch (error) {
    logger.error('Failed to get unreviewed dead letter items', { error: error.message });
    throw new BouncerDbError('Failed to get dead letter items', 'GET_DEAD_LETTER_ERROR', { originalError: error });
  }
}

/**
 * Mark dead letter queue item as reviewed
 * @param {number} id - Dead letter queue ID
 * @returns {Promise<boolean>} Success status
 */
async function markDeadLetterItemReviewed(id) {
  try {
    validate.positiveInteger(id, 'id');

    const updated = await knex('Bouncer_Dead_Letter_Queue')
      .where('id', id)
      .update({ reviewed: true });

    if (updated === 0) {
      throw new BouncerDbError('Dead letter item not found', 'DEAD_LETTER_NOT_FOUND');
    }

    logger.info('Dead letter item marked as reviewed', { id });
    return true;
  } catch (error) {
    logger.error('Failed to mark dead letter item as reviewed', { error: error.message, id });
    throw new BouncerDbError('Failed to mark dead letter item as reviewed', 'MARK_DEAD_LETTER_REVIEWED_ERROR', { originalError: error });
  }
}

// =============================================================================
// HEALTH METRICS OPERATIONS
// =============================================================================

/**
 * Record health metric
 * @param {string} metricName - Name of the metric
 * @param {number} metricValue - Value of the metric
 * @returns {Promise<boolean>} Success status
 */
async function recordHealthMetric(metricName, metricValue) {
  try {
    validate.required(metricName, 'metricName');
    validate.required(metricValue, 'metricValue');

    await knex('Bouncer_Health_Metrics').insert({
      metric_name: metricName,
      metric_value: metricValue
    });

    logger.debug('Health metric recorded', { metricName, metricValue });
    return true;
  } catch (error) {
    logger.error('Failed to record health metric', { error: error.message, metricName, metricValue });
    throw new BouncerDbError('Failed to record health metric', 'RECORD_HEALTH_METRIC_ERROR', { originalError: error });
  }
}

/**
 * Get recent health metrics
 * @param {string} metricName - Name of the metric
 * @param {number} hoursBack - Number of hours to look back
 * @returns {Promise<Array>} Array of health metrics
 */
async function getHealthMetrics(metricName, hoursBack = 24) {
  try {
    validate.required(metricName, 'metricName');
    validate.positiveInteger(hoursBack, 'hoursBack');

    const cutoff = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));

    const metrics = await knex('Bouncer_Health_Metrics')
      .where('metric_name', metricName)
      .where('recorded_ts', '>=', cutoff)
      .orderBy('recorded_ts', 'desc');

    return metrics;
  } catch (error) {
    logger.error('Failed to get health metrics', { error: error.message, metricName });
    throw new BouncerDbError('Failed to get health metrics', 'GET_HEALTH_METRICS_ERROR', { originalError: error });
  }
}

/**
 * Clean up old health metrics
 * @param {number} daysBack - Delete metrics older than this many days
 * @returns {Promise<number>} Number of records deleted
 */
async function cleanupHealthMetrics(daysBack = 30) {
  try {
    const cutoff = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000));

    const deleted = await knex('Bouncer_Health_Metrics')
      .where('recorded_ts', '<', cutoff)
      .del();

    logger.info('Health metrics cleaned up', { deleted, daysBack });
    return deleted;
  } catch (error) {
    logger.error('Failed to cleanup health metrics', { error: error.message });
    throw new BouncerDbError('Failed to cleanup health metrics', 'CLEANUP_HEALTH_METRICS_ERROR', { originalError: error });
  }
}

// =============================================================================
// COMPLEX OPERATIONS & TRANSACTIONS
// =============================================================================

/**
 * Create batch with queue assignment transaction
 * @param {Object} batchData - Batch creation data
 * @param {Array} queueIds - Queue IDs to assign to batch
 * @returns {Promise<Object>} Created batch information
 */
async function createBatchWithQueueAssignment(batchData, queueIds) {
  try {
    validate.required(batchData, 'batchData');
    validate.required(queueIds, 'queueIds');

    if (!Array.isArray(queueIds) || queueIds.length === 0) {
      throw new BouncerDbError('Queue IDs must be a non-empty array', 'VALIDATION_ERROR');
    }

    logger.info('Creating batch with queue assignment', { batchData, queueCount: queueIds.length });

    return await knex.transaction(async (trx) => {
      // Create batch
      const [batchId] = await trx('Bouncer_Batches').insert({
        batch_id: batchData.batchId,
        user_id: batchData.userId,
        request_id: batchData.requestId,
        status: 'queued',
        quantity: batchData.quantity,
        duplicates: batchData.duplicates || 0,
        retry_count: 0
      });

      // Assign queue items to batch
      const updated = await trx('Bouncer_Queue')
        .whereIn('queue_id', queueIds)
        .where('status', 'queued')
        .update({
          batch_id: batchId,
          status: 'assigned',
          assigned_ts: knex.fn.now()
        });

      if (updated !== queueIds.length) {
        throw new BouncerDbError('Some queue items could not be assigned', 'QUEUE_ASSIGNMENT_ERROR');
      }

      logger.info('Batch created with queue assignment', { batchId, assigned: updated });
      return { batchId, assigned: updated };
    });
  } catch (error) {
    logger.error('Failed to create batch with queue assignment', { error: error.message, batchData, queueCount: queueIds?.length });
    throw new BouncerDbError('Failed to create batch with queue assignment', 'CREATE_BATCH_WITH_QUEUE_ERROR', { originalError: error });
  }
}

/**
 * Complete batch processing transaction
 * @param {number} batchId - Internal batch ID
 * @param {Array} results - Array of result objects
 * @returns {Promise<boolean>} Success status
 */
async function completeBatchProcessing(batchId, results) {
  try {
    validate.positiveInteger(batchId, 'batchId');
    validate.required(results, 'results');

    logger.info('Completing batch processing', { batchId, resultCount: results.length });

    return await knex.transaction(async (trx) => {
      // Store detailed results
      if (results.length > 0) {
        const resultRecords = results.map(result => ({
          batch_id: batchId,
          global_id: result.global_id,
          bouncer_status: result.status,
          bouncer_reason: result.reason,
          domain_info: result.domain_info ? JSON.stringify(result.domain_info) : null,
          account_info: result.account_info ? JSON.stringify(result.account_info) : null,
          dns_info: result.dns_info ? JSON.stringify(result.dns_info) : null,
          provider: result.provider,
          score: result.score,
          toxic: result.toxic,
          toxicity: result.toxicity
        }));

        await trx('Bouncer_Results').insert(resultRecords);

        // Update Contacts_Global with latest results
        for (const result of results) {
          await trx('Contacts_Global')
            .where('global_id', result.global_id)
            .update({
              latest_result: result.status,
              last_mail_server: result.provider,
              last_processed_ts: knex.fn.now()
            });
        }
      }

      // Update batch status
      await trx('Bouncer_Batches')
        .where('id', batchId)
        .update({
          status: 'completed',
          completed_ts: knex.fn.now(),
          updated_ts: knex.fn.now()
        });

      // Update queue items status
      await trx('Bouncer_Queue')
        .where('batch_id', batchId)
        .update({
          status: 'completed',
          completed_ts: knex.fn.now()
        });

      logger.info('Batch processing completed', { batchId, resultCount: results.length });
      return true;
    });
  } catch (error) {
    logger.error('Failed to complete batch processing', { error: error.message, batchId, resultCount: results?.length });
    throw new BouncerDbError('Failed to complete batch processing', 'COMPLETE_BATCH_PROCESSING_ERROR', { originalError: error });
  }
}

/**
 * Get comprehensive system health status
 * @returns {Promise<Object>} System health information
 */
async function getSystemHealthStatus() {
  try {
    const [
      queueStats,
      activeBatches,
      recentFailures,
      rateLimitStatus
    ] = await Promise.all([
      getQueueStats(),
      getActiveBatchCount(),
      knex('Bouncer_Batches').where('status', 'failed').where('created_ts', '>=', new Date(Date.now() - 3600000)).count('* as count').first(),
      canMakeApiCall()
    ]);

    const health = {
      timestamp: new Date(),
      queue_stats: queueStats,
      active_batches: activeBatches,
      recent_failures: parseInt(recentFailures.count),
      rate_limit_ok: rateLimitStatus,
      database_connection: true // If we got here, DB is working
    };

    // Record health metrics
    await recordHealthMetric('active_batches', activeBatches);
    await recordHealthMetric('queue_total', queueStats.total);
    await recordHealthMetric('recent_failures', health.recent_failures);

    return health;
  } catch (error) {
    logger.error('Failed to get system health status', { error: error.message });
    throw new BouncerDbError('Failed to get system health status', 'GET_SYSTEM_HEALTH_ERROR', { originalError: error });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Error class
  BouncerDbError,
  
  // Batch operations
  createBatch,
  getBatchById,
  getBatchByBouncerId,
  updateBatchStatus,
  incrementBatchRetryCount,
  getActiveBatchCount,
  getBatchesByStatus,
  
  // Queue operations
  addEmailsToQueue,
  getQueuedEmails,
  assignQueueItemsToBatch,
  updateQueueItemStatus,
  getQueueStats,
  getDomainDistribution,
  
  // Rate limiting operations
  recordApiCall,
  canMakeApiCall,
  getNextAvailableTime,
  cleanupRateLimitRecords,
  
  // Results operations
  storeBatchResults,
  getBatchResults,
  getBatchResultStats,
  
  // Dead letter queue operations
  addToDeadLetterQueue,
  getUnreviewedDeadLetterItems,
  markDeadLetterItemReviewed,
  
  // Health metrics operations
  recordHealthMetric,
  getHealthMetrics,
  cleanupHealthMetrics,
  
  // Complex operations
  createBatchWithQueueAssignment,
  completeBatchProcessing,
  getSystemHealthStatus,
  
  // Utility functions
  generateDomainHash,
  
  // Direct knex access for advanced operations
  knex
};