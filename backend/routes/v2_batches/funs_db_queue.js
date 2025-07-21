// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const { stripEmailModifiers } = require('../../utils/processEmails.js');

// Helper Functions (Mirror existing patterns from funs_db.js)
const getBatchTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Batches_Deliverable';
        case 'catchall':
            return 'Batches_Catchall';
        default:
            return null;
    }
}

const getResultsTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Email_Deliverable_Results';
        case 'catchall':
            return 'Email_Catchall_Results';
        default:
            return null;
    }
}

const getBouncerEmailTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Bouncer_Batch_Emails_Deliverable';
        case 'catchall':
            return 'Bouncer_Batch_Emails_Catchall';
        default:
            return null;
    }
}

const getBatchEmailAssociationTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Batch_Emails_Deliverable';
        case 'catchall':
            return 'Batch_Emails_Catchall';
        default:
            return null;
    }
}

// ==========================================
// 1. GREEDY BATCH CREATION FUNCTIONS
// ==========================================

/**
 * Count current outstanding bouncer batches and return available capacity for multi-batch creation
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number, number]} - [success, current_count, available_capacity]
 */
async function db_getOutstandingBouncerBatchCount(check_type) {
    const batch_table = getBatchTableName(check_type);
    if (!batch_table) return [false, 0, 0];

    let err_code;
    const result = await knex(batch_table)
        .countDistinct('bouncer_batch_id as count')
        .where('status', 'processing')
        .whereNotNull('bouncer_batch_id')
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false, 0, 0];

    const current_count = parseInt(result[0].count) || 0;
    const available_capacity = Math.max(0, 15 - current_count);

    return [true, current_count, available_capacity];
}

/**
 * Greedily collect up to 10k emails from multiple user batches, ordered by timestamp (FIFO), with user batch splitting support
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @param {number} max_emails - Maximum emails to collect (default 10000)
 * @returns {[boolean, Array]} - [success, emails_data] where emails_data contains {email_global_id, email_stripped, user_batch_id}
 */
async function db_getEmailsForGreedyBatch(check_type, max_emails = 10000) {
    const batch_table = getBatchTableName(check_type);
    const batch_email_table = getBatchEmailAssociationTableName(check_type);
    if (!batch_table || !batch_email_table) return [false, []];

    let err_code;
    const emails = await knex(batch_email_table + ' as bed')
        .join('Emails_Global as eg', 'bed.email_global_id', 'eg.global_id')
        .join(batch_table + ' as bd', 'bed.batch_id', 'bd.id')
        .select(
            'eg.global_id as email_global_id',
            'eg.email_stripped',
            'bed.batch_id as user_batch_id',
            'bd.new_verifications as user_batch_total',
            'bd.created_ts'
        )
        .where('bd.bouncer_batch_id', null)
        .where('bd.new_verifications', '>', 0)
        .where('bd.status', 'queued')
        .where('bed.used_cached', 0)
        .orderBy('bd.created_ts', 'asc')
        .orderBy('bed.email_global_id', 'asc')
        .limit(max_emails)
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false, []];

    return [true, emails || []];
}

/**
 * Assign bouncer_batch_id to multiple user batches and create email tracking
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {Array} batch_assignments - [{user_batch_id, email_global_ids, is_partial}]
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, affected_user_batches_count]
 */
async function db_assignBouncerBatchId(bouncer_batch_id, batch_assignments, check_type) {
    const batch_table = getBatchTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    if (!batch_table || !bouncer_email_table) return [false, 0];

    const trx = await knex.transaction();
    try {
        let affected_batches = 0;

        // Process each batch assignment
        for (const assignment of batch_assignments) {
            const { user_batch_id, email_global_ids } = assignment;

            // 1. Update user batch with bouncer_batch_id and set status to processing
            await trx(batch_table)
                .where('id', user_batch_id)
                .update({
                    bouncer_batch_id: bouncer_batch_id,
                    status: 'processing'
                });

            affected_batches++;

            // 2. Create email tracking entries
            const tracking_entries = email_global_ids.map(email_global_id => ({
                bouncer_batch_id: bouncer_batch_id,
                email_global_id: email_global_id,
                user_batch_id: user_batch_id
            }));

            await trx(bouncer_email_table).insert(tracking_entries);

            // 3. Handle partial batches - update new_verifications count if needed
            // For now, assume all selected emails are processed (can be enhanced later)
        }

        await trx.commit();
        return [true, affected_batches];

    } catch (err) {
        await trx.rollback();
        return [false, 0];
    }
}

// ==========================================
// 2. STATUS CHECK FUNCTIONS
// ==========================================

/**
 * Get ALL bouncer_batch_ids that need status checking
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, Array]} - [success, bouncer_batch_ids_array]
 */
async function db_getOutstandingBouncerBatches(check_type) {
    const batch_table = getBatchTableName(check_type);
    if (!batch_table) return [false, []];

    let err_code;
    const result = await knex(batch_table)
        .distinct('bouncer_batch_id')
        .where('status', 'processing')
        .whereNotNull('bouncer_batch_id')
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false, []];

    const bouncer_batch_ids = result.map(row => row.bouncer_batch_id);
    return [true, bouncer_batch_ids];
}

/**
 * Mark ALL user batches with this bouncer_batch_id as failed
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, affected_count]
 */
async function db_markBouncerBatchFailed(bouncer_batch_id, check_type) {
    const batch_table = getBatchTableName(check_type);
    if (!batch_table) return [false, 0];

    let err_code;
    const result = await knex(batch_table)
        .where('bouncer_batch_id', bouncer_batch_id)
        .update({ status: 'failed' })
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false, 0];
    return [true, result || 0];
}

// ==========================================
// 3. RESULT PROCESSING FUNCTIONS
// ==========================================

/**
 * Process bouncer results using email stripping, update global results, complete user batches
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {Array} results_array - Results from bouncer API
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, processed_count]
 */
async function db_processBouncerResults(bouncer_batch_id, results_array, check_type) {
    const batch_table = getBatchTableName(check_type);
    const results_table = getResultsTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    const batch_email_table = getBatchEmailAssociationTableName(check_type);
    
    if (!batch_table || !results_table || !bouncer_email_table || !batch_email_table) {
        return [false, 0];
    }

    const trx = await knex.transaction();
    try {
        let processed_count = 0;

        // Process each email result
        for (const result of results_array) {
            // 1. Strip email and find global ID
            const stripped_email = stripEmailModifiers(result.email);
            const [global_id_success, global_id] = await db_getGlobalIdByStrippedEmail_trx(trx, stripped_email);
            if (!global_id_success) continue;

            // 2. Find user batch ID for this email
            const [user_batch_success, user_batch_id] = await db_getUserBatchIdByGlobalId_trx(trx, bouncer_batch_id, global_id, check_type);
            if (!user_batch_success) continue;

            // 3. Update global results
            if (check_type === 'deliverable') {
                await trx(results_table)
                    .insert({
                        email_global_id: global_id,
                        email_nominal: result.email,
                        status: result.status || 'unknown',
                        reason: result.reason || 'unknown',
                        is_catchall: result.is_catchall || 0,
                        score: result.score || 0
                    })
                    .onConflict('email_global_id')
                    .merge({
                        status: result.status || 'unknown',
                        reason: result.reason || 'unknown',
                        is_catchall: result.is_catchall || 0,
                        score: result.score || 0,
                        updated_ts: knex.fn.now()
                    });
            } else if (check_type === 'catchall') {
                await trx(results_table)
                    .insert({
                        email_global_id: global_id,
                        email_nominal: result.email,
                        toxicity: result.toxicity || 0
                    })
                    .onConflict('email_global_id')
                    .merge({
                        toxicity: result.toxicity || 0,
                        updated_ts: knex.fn.now()
                    });
            }

            // 4. Mark email as processed in batch associations
            await trx(batch_email_table)
                .where('email_global_id', global_id)
                .where('batch_id', user_batch_id)
                .update({ used_cached: 0 }); // Mark as newly verified (not cached)

            processed_count++;
        }

        // 5. Complete user batches - mark as completed when ALL their emails are processed
        // Check which user batches no longer have any uncached emails
        const completed_batches = await trx(batch_table)
            .where('bouncer_batch_id', bouncer_batch_id)
            .where('status', 'processing')
            .whereNotExists(function() {
                this.select('*')
                    .from(batch_email_table + ' as bed')
                    .whereRaw('bed.batch_id = ' + batch_table + '.id')
                    .where('bed.used_cached', 1);
            })
            .update({
                status: 'completed',
                completed_ts: knex.fn.now()
            });

        await trx.commit();
        return [true, processed_count];

    } catch (err) {
        await trx.rollback();
        console.error('Error processing bouncer results:', err);
        return [false, 0];
    }
}

// ==========================================
// 4. RATE LIMITING FUNCTIONS
// ==========================================

/**
 * Check if we can make API request without exceeding rate limits (200/min - 180 buffer = 20 safety margin)
 * @param {string} verification_type - 'deliverable' or 'catchall'
 * @param {string} request_type - 'create_batch', 'check_status', 'download_results'
 * @param {number} buffer_requests - Buffer to leave (default 180)
 * @returns {[boolean, boolean, number]} - [success, can_make_request, current_count]
 */
async function db_checkRateLimit(verification_type, request_type, buffer_requests = 180) {
    let err_code;
    const result = await knex('Rate_Limit_Tracker')
        .sum('request_count as total_requests')
        .where('verification_type', verification_type)
        .where('request_type', request_type)
        .where('window_start', '>=', knex.raw('DATE_SUB(NOW(), INTERVAL 1 MINUTE)'))
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false, false, 0];

    const current_count = parseInt(result[0].total_requests) || 0;
    const safety_limit = 200 - buffer_requests; // 20 requests with 180 buffer
    const can_make_request = (current_count + 1) <= safety_limit;

    return [true, can_make_request, current_count];
}

/**
 * Record API request for rate limiting tracking
 * @param {string} verification_type - 'deliverable' or 'catchall'
 * @param {string} request_type - 'create_batch', 'check_status', 'download_results'
 * @param {number} request_count - Number of requests to record (default 1)
 * @returns {[boolean]} - [success]
 */
async function db_recordRateLimit(verification_type, request_type, request_count = 1) {
    let err_code;
    await knex('Rate_Limit_Tracker')
        .insert({
            verification_type: verification_type,
            request_type: request_type,
            request_count: request_count,
            window_start: knex.fn.now()
        })
        .catch((err) => { if (err) err_code = err.code });

    if (err_code) return [false];
    return [true];
}

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================

/**
 * Get global_id for stripped email (used in result processing)
 * @param {string} email_stripped - The stripped email
 * @returns {[boolean, number|null]} - [success, global_id]
 */
async function db_getGlobalIdByStrippedEmail(email_stripped) {
    let err_code;
    const result = await knex('Emails_Global')
        .select('global_id')
        .where('email_stripped', email_stripped)
        .first()
        .catch((err) => { if (err) err_code = err.code });

    if (err_code || !result) return [false, null];
    return [true, result.global_id];
}

/**
 * Transaction version of getGlobalIdByStrippedEmail
 */
async function db_getGlobalIdByStrippedEmail_trx(trx, email_stripped) {
    try {
        const result = await trx('Emails_Global')
            .select('global_id')
            .where('email_stripped', email_stripped)
            .first();

        if (!result) return [false, null];
        return [true, result.global_id];
    } catch (err) {
        return [false, null];
    }
}

/**
 * Get user_batch_id for email in specific bouncer batch (used in result processing)
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {number} email_global_id - Global ID of the email
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number|null]} - [success, user_batch_id]
 */
async function db_getUserBatchIdByGlobalId(bouncer_batch_id, email_global_id, check_type) {
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    if (!bouncer_email_table) return [false, null];

    let err_code;
    const result = await knex(bouncer_email_table)
        .select('user_batch_id')
        .where('bouncer_batch_id', bouncer_batch_id)
        .where('email_global_id', email_global_id)
        .first()
        .catch((err) => { if (err) err_code = err.code });

    if (err_code || !result) return [false, null];
    return [true, result.user_batch_id];
}

/**
 * Transaction version of getUserBatchIdByGlobalId
 */
async function db_getUserBatchIdByGlobalId_trx(trx, bouncer_batch_id, email_global_id, check_type) {
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    if (!bouncer_email_table) return [false, null];

    try {
        const result = await trx(bouncer_email_table)
            .select('user_batch_id')
            .where('bouncer_batch_id', bouncer_batch_id)
            .where('email_global_id', email_global_id)
            .first();

        if (!result) return [false, null];
        return [true, result.user_batch_id];
    } catch (err) {
        return [false, null];
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    // Greedy Batch Creation
    db_getOutstandingBouncerBatchCount,
    db_getEmailsForGreedyBatch,
    db_assignBouncerBatchId,
    
    // Status Checks (Simplified)
    db_getOutstandingBouncerBatches,
    db_markBouncerBatchFailed,
    
    // Result Processing (Fire-and-Forget)
    db_processBouncerResults,
    
    // Rate Limiting
    db_checkRateLimit,
    db_recordRateLimit,
    
    // Helper Functions
    db_getGlobalIdByStrippedEmail,
    db_getUserBatchIdByGlobalId
};