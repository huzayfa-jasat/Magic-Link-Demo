// Dependencies
const knex = require('knex')(require('../knexfile.js').development);
const { resend_sendBatchCompletionEmail } = require('../external_apis/resend.js');

// Util Imports
const { stripEmailModifiers } = require('../utils/processEmails.js');

// Function Imports
const {
    getBatchTableName,
    getResultsTableName,
    getBouncerBatchTableName,
    getBouncerEmailTableName,
    getEmailBatchAssociationTableName
} = require('../routes/batches/funs_db_utils.js');

// S3 Function Imports
const { s3_triggerS3Enrichment } = require('../routes/batches/funs_s3');
const db_s3_funcs = require('../routes/batches/funs_db_s3');

// Helper Functions

// ==========================================
// 1. GREEDY BATCH CREATION FUNCTIONS
// ==========================================

/**
 * Count current outstanding bouncer batches and return available capacity - NEW ARCHITECTURE
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number, number]} - [success, current_count, available_capacity]
 */
async function db_getOutstandingBouncerBatchCount(check_type) {
    // Get bouncer batch tracking table
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    if (!bouncer_batch_table) return [false, 0, 0];

    // Get current count of active bouncer batches
    let err_code;
    const result = await knex(bouncer_batch_table)
        .count('* as count')
        .whereIn('status', ['pending', 'processing'])
        .catch((err) => { if (err) err_code = err.code });
    if (err_code) {
        console.error('Error getting outstanding bouncer batch count:', err_code);
        return [false, 0, 0];
    }

    // Get available capacity (max 10 concurrent bouncer batches as per user requirement)
    const current_count = parseInt(result[0].count) || 0;
    const available_capacity = Math.max(0, 10 - current_count);

    // Return
    return [true, current_count, available_capacity];
}

/**
 * Greedily collect up to 10k emails from multiple user batches, ordered by timestamp (FIFO), with user batch splitting support
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @param {number} max_emails - Maximum emails to collect (default 10000)
 * @returns {[boolean, Array]} - [success, emails_data] where emails_data contains {email_global_id, email_stripped, user_batch_id}
 */
async function db_getEmailsForGreedyBatch(check_type, max_emails = 10000) {
    // Get table names
    const batch_table = getBatchTableName(check_type);
    const batch_email_table = getEmailBatchAssociationTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    if (!batch_table || !batch_email_table || !bouncer_email_table) return [false, []];

    // Get emails that are not yet assigned to any bouncer batch
    let err_code;
    const emails = await knex(batch_email_table + ' as bed')
        .join('Emails_Global as eg', 'bed.email_global_id', 'eg.global_id')
        .join(batch_table + ' as bd', 'bed.batch_id', 'bd.id')
        .leftJoin(bouncer_email_table + ' as bet', 'bed.email_global_id', 'bet.email_global_id')
        .select(
            'eg.global_id as email_global_id',
            'eg.email_stripped',
            'bed.batch_id as user_batch_id',
            'bd.created_ts'
        )
        .whereIn('bd.status', ['queued', 'processing'])
        .where({
            'bd.is_archived': 0,
            'bed.used_cached': 0,
            'bed.did_complete': 0,
            'bet.email_global_id': null,
        })
        .orderBy('bd.created_ts', 'asc')
        .orderBy('bed.email_global_id', 'asc')
        .limit(max_emails)
        .catch((err) => { if (err) err_code = err.code });
    if (err_code) {
        console.log("GET EMAILS FOR GREEDY BATCH ERR 1 = ", err_code);
        return [false, []];
    }

    // Return
    return [true, emails || []];
}

/**
 * Create bouncer batch tracking record and assign emails - NEW ARCHITECTURE
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {Array} batch_assignments - [{user_batch_id, email_global_ids}]
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, affected_user_batches_count]
 */
async function db_assignBouncerBatchId(bouncer_batch_id, batch_assignments, check_type) {
    // Get table names
    const batch_table = getBatchTableName(check_type);
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    if (!batch_table || !bouncer_batch_table || !bouncer_email_table) return [false, 0];

    // Create transaction
    const trx = await knex.transaction();
    try {
        let affected_batches = 0;
        let total_emails = 0;

        // Process each batch assignment (in order)
        for (const assignment of batch_assignments) {
            const { user_batch_id, email_global_ids } = assignment;

            // 1. Update user batch status to "processing" (remove bouncer_batch_id field usage)
            await trx(batch_table)
                .where('id', user_batch_id)
                .update({
                    status: 'processing'
                });

            // 2. Create email tracking entries (for each email)
            const tracking_entries = email_global_ids.map(email_global_id => ({
                bouncer_batch_id: bouncer_batch_id,
                email_global_id: email_global_id,
                user_batch_id: user_batch_id
            }));

            // Insert email tracking entries
            await trx(bouncer_email_table).insert(tracking_entries);

            // Track metrics
            affected_batches++;
            total_emails += email_global_ids.length;
        }

        // 3. CRITICAL: Create bouncer batch tracking record with status='pending'
        await trx(bouncer_batch_table).insert({
            bouncer_batch_id: bouncer_batch_id,
            user_batch_id: batch_assignments[0].user_batch_id, // Primary user batch (for organization)
            status: 'pending',
            email_count: total_emails
        });

        // Commit transaction
        await trx.commit();

        console.log(`✅ Created bouncer batch tracking record: ${bouncer_batch_id} (${total_emails} emails, ${affected_batches} user batches)`);
        return [true, affected_batches];

    } catch (err) {
        console.error('Error in db_assignBouncerBatchId:', err);
        // Rollback transaction
        await trx.rollback();
        return [false, 0];
    }
}

// ==========================================
// 2. STATUS CHECK FUNCTIONS
// ==========================================

/**
 * Get bouncer_batch_ids that need status checking - NEW ARCHITECTURE
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, Array]} - [success, bouncer_batch_ids_array]
 */
async function db_getOutstandingBouncerBatches(check_type) {
    // Get bouncer batch tracking table
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    if (!bouncer_batch_table) return [false, []];

    // Get bouncer batch ids with status 'pending' or 'processing'
    let err_code;
    const result = await knex(bouncer_batch_table)
        .select('bouncer_batch_id')
        .whereIn('status', ['pending', 'processing'])
        .orderBy('created_ts', 'asc') // FIFO processing
        .catch((err) => { if (err) err_code = err.code });
    if (err_code) {
        console.error('Error getting outstanding bouncer batches:', err_code);
        return [false, []];
    }

    // Return (flat array of bouncer batch id's)
    const bouncer_batch_ids = result.map(row => row.bouncer_batch_id);
    return [true, bouncer_batch_ids];
}

/**
 * Mark bouncer batch as failed - NEW ARCHITECTURE
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, affected_count]
 */
async function db_markBouncerBatchFailed(bouncer_batch_id, check_type) {
    // Get table names
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    if (!bouncer_batch_table) return [false, 0];

    // Mark bouncer batch as failed
    let err_code;
    const result = await knex(bouncer_batch_table)
        .where('bouncer_batch_id', bouncer_batch_id)
        .update({ 
            status: 'failed',
            updated_ts: knex.fn.now()
        })
        .catch((err) => { if (err) err_code = err.code });
    if (err_code) {
        console.error('Error marking bouncer batch as failed:', err_code);
        return [false, 0];
    }

    console.log(`💀 Marked bouncer batch ${bouncer_batch_id} as failed`);
    
    // TODO: Could also mark associated user batches as failed if all their bouncer batches have failed
    // For now, individual bouncer batch failures don't fail the entire user batch
    // However ... this would cause permanent "processing" status for user batch.
    
    return [true, result || 0];
}

/**
 * Update processed count for a bouncer batch
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {number} processed_count - Number of emails processed so far
 * @returns {[boolean, number]} - [success, affected_count]
 */
async function db_updateBouncerBatchProcessed(check_type, bouncer_batch_id, processed_count) {
    // Get table names
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    if (!bouncer_batch_table) return [false, 0];

    // Update processed count
    let err_code;
    const result = await knex(bouncer_batch_table)
        .where('bouncer_batch_id', bouncer_batch_id)
        .update({ 
            processed: processed_count,
            updated_ts: knex.fn.now()
        })
        .catch((err) => { if (err) err_code = err.code });
    if (err_code) {
        console.error('Error updating bouncer batch processed count:', err_code);
        return [false, 0];
    }

    return [true, result || 0];
}

// ==========================================
// 3. RESULT PROCESSING FUNCTIONS
// ==========================================

/**
 * Process bouncer results and update bouncer batch status - NEW ARCHITECTURE
 * @param {string} bouncer_batch_id - ID from bouncer API
 * @param {Array} results_array - Results from bouncer API
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {[boolean, number]} - [success, processed_count]
 */
async function db_processBouncerResults(bouncer_batch_id, results_array, check_type) {
    let err_code;

    // Get table names
    const batch_table = getBatchTableName(check_type);
    const results_table = getResultsTableName(check_type);
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    const batch_email_table = getEmailBatchAssociationTableName(check_type);

    // Check if table names are valid
    if (!batch_table || !results_table || !bouncer_batch_table || !bouncer_email_table || !batch_email_table) {
        console.error("DB_PROCESS_BOUNCER_RESULTS ERR = MISSING TABLES");
        return [false, 0];
    }

    // Use transaction for atomic operations
    const trx = await knex.transaction();
    try {
        // 1. CRITICAL: Mark bouncer batch as completed FIRST (prevents duplicate processing)
        await trx(bouncer_batch_table)
            .where('bouncer_batch_id', bouncer_batch_id)
            .update({ 
                status: 'completed',
                updated_ts: knex.fn.now()
            });

        console.log(`✅ Marked bouncer batch ${bouncer_batch_id} as completed (processing ${results_array.length} results)`);

        // 2. Retrieve all global email ID's for results
        const stripped_emails = results_array.map(result => stripEmailModifiers(result.email));
        const email_ids = await trx('Emails_Global').join(
            bouncer_email_table,
            'Emails_Global.global_id',
            `${bouncer_email_table}.email_global_id`
        ).select(
            'Emails_Global.global_id',
            'Emails_Global.email_stripped',
            `${bouncer_email_table}.user_batch_id`
        ).where(
            `${bouncer_email_table}.bouncer_batch_id`, bouncer_batch_id
        ).whereIn(
            'Emails_Global.email_stripped', stripped_emails
        );

        // Construct dict for fast lookup
        const email_ids_dict = {};
        const affected_user_batches = new Set();
        for (const email_id of email_ids) {
            email_ids_dict[email_id.email_stripped] = {
                global_id: email_id.global_id,
                user_batch_id: email_id.user_batch_id
            };
            affected_user_batches.add(email_id.user_batch_id);
        }

        // 3. Create global results update array
        let global_results_update_array = [];
        for (const result of results_array) {
            const curr_stripped_email = stripEmailModifiers(result.email);
            const email_info = email_ids_dict[curr_stripped_email];
            
            if (!email_info) continue; // Skip if email not found
            
            // Construct update object
            let update_object = {
                'email_global_id': email_info.global_id,
            }
            switch (check_type) {
                case 'deliverable':
                    update_object.status = result.status || 'unknown';
                    update_object.reason = result.reason || 'unknown';
                    update_object.is_catchall = (result.is_catchall === 'no') ? 0 : 1;
                    update_object.score = result.score || 0;
                    update_object.provider = result.provider || null;
                    break;
                case 'catchall':
                    console.log("CATCHALL RESULT TOXICITY FOR ", result.email, " = ", result.toxicity);
                    update_object.toxicity = result.toxicity || 0;
                    break;
                default:
                    break;
            }

            global_results_update_array.push(update_object);
        }

        // 4. Update global results
        if (global_results_update_array.length > 0) {
            await trx(results_table)
                .insert(global_results_update_array)
                .onConflict()
                .merge();

            // 5. Mark emails as processed in batch associations
            await trx(batch_email_table).whereIn(
                'email_global_id', global_results_update_array.map(result => result.email_global_id)
            ).update({
                did_complete: 1
            });
        }

        // 6. Check if user batches are complete (NEW LOGIC)
        for (const user_batch_id of affected_user_batches) {
            await checkAndCompleteUserBatch(trx, user_batch_id, check_type);
        }

        // Commit transaction
        await trx.commit();
        
        console.log(`🎉 Successfully processed ${global_results_update_array.length} results for bouncer batch ${bouncer_batch_id}`);
        return [true, global_results_update_array.length];

    } catch (error) {
        await trx.rollback();
        console.error('Error in db_processBouncerResults:', error);
        return [false, 0];
    }
}

/**
 * Check if user batch is complete and update status accordingly - NEW HELPER FUNCTION
 * @param {Object} trx - Knex transaction
 * @param {number} user_batch_id - User batch ID
 * @param {string} check_type - 'deliverable' or 'catchall'
 */
async function checkAndCompleteUserBatch(trx, user_batch_id, check_type) {
    const batch_table = getBatchTableName(check_type);
    const batch_email_table = getEmailBatchAssociationTableName(check_type);

    // Check if all emails in this user batch are complete
    const incomplete_emails = await trx(batch_email_table)
        .where('batch_id', user_batch_id)
        .where('did_complete', 0)
        .count('* as count')
        .first();

    if (incomplete_emails.count === 0) {
        // All emails are complete - mark user batch as completed
        await trx(batch_table)
            .where('id', user_batch_id)
            .update({
                status: 'completed',
                completed_ts: knex.fn.now()
            });
        
        console.log(`✅ User batch ${user_batch_id} completed (all emails processed)`);
        
        // Send batch completion email notification
        try {
            // Get batch details
            const [batch_ok, batch_details] = await getBatchDetails(user_batch_id, check_type);
            if (!batch_ok) return;

            // Get user email
            const [email_ok, user_email] = await getUserEmail(batch_details.user_id);
            if (!email_ok) return;

            // Send batch completion email
            const email_result = await resend_sendBatchCompletionEmail(
                user_email,
                batch_details.title || 'Untitled Batch',
                check_type,
                user_batch_id
            );
            
            if (email_result.error) {
                console.log(`⚠️ Failed to send batch completion email for batch ${user_batch_id}:`, email_result.error);
            } else {
                console.log(`📧 Batch completion email sent for batch ${user_batch_id}`);
            }
        } catch (email_error) {
            console.log(`⚠️ Error sending batch completion email for batch ${user_batch_id}:`, email_error);
        }
        
        // Trigger S3 enrichment (non-blocking)
        try {
            // Don't await - let it run in background
            s3_triggerS3Enrichment(user_batch_id, check_type, db_s3_funcs)
                .then(() => {
                    console.log(`✅ S3 enrichment completed for batch ${user_batch_id}`);
                })
                .catch((error) => {
                    console.error(`❌ S3 enrichment failed for batch ${user_batch_id}:`, error);
                });
            
            console.log(`🚀 S3 enrichment triggered for batch ${user_batch_id}`);
        } catch (enrichment_error) {
            console.error(`⚠️ Error triggering S3 enrichment for batch ${user_batch_id}:`, enrichment_error);
        }
    }
}

// ==========================================
// 4. RATE LIMITING FUNCTIONS
// ==========================================

/**
 * Check if we can make API request without exceeding rate limits (200/min - 20 buffer = 180 usable)
 * @param {string} verification_type - 'deliverable' or 'catchall'
 * @param {string} request_type - 'create_batch', 'check_status', 'download_results'
 * @param {number} buffer_requests - Buffer to leave (default 20)
 * @returns {[boolean, boolean, number]} - [success, can_make_request, current_count]
 */
async function db_checkRateLimit(verification_type, request_type, buffer_requests = 20) {
    let err_code;

    // Get current count
    const result = await knex('Rate_Limit_Tracker').sum(
        'request_count as total_requests'
    ).where({
        'verification_type': verification_type,
        'request_type': request_type
    }).where(
        'window_start', '>=', knex.raw('DATE_SUB(NOW(), INTERVAL 1 MINUTE)')
    ).catch((err) => { if (err) err_code = err.code });
    if (err_code) return [false, false, 0];

    // Get safety limit
    const current_count = parseInt(result[0].total_requests) || 0;
    const safety_limit = 200 - buffer_requests; // 180 requests with 20 buffer
    const can_make_request = (current_count + 1) <= safety_limit;

    // Return
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

    // Record request
    await knex('Rate_Limit_Tracker').insert({
        verification_type: verification_type,
        request_type: request_type,
        request_count: request_count,
        window_start: knex.fn.now()
    }).catch((err) => { if (err) err_code = err.code });
    if (err_code) return [false];

    // Return
    return [true];
}

/**
 * Get user email by user_id
 * @param {number} user_id - User ID
 * @returns {Promise<[boolean, string|null]>} - [success, email]
 */
async function getUserEmail(user_id) {
	let err_code;
	
	const db_resp = await knex('Users').where('id', user_id).select('email AS email').limit(1).catch((err)=>{if (err) err_code = err.code});
	if (err_code || db_resp.length <= 0) return [false, null];
	
	return [true, db_resp[0].email];
}

/**
 * Get batch details by batch_id
 * @param {number} batch_id - Batch ID
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {Promise<[boolean, object|null]>} - [success, batch_details]
 */
async function getBatchDetails(batch_id, check_type) {
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return [false, null];
	
	let err_code;
	const batch = await knex(batch_table).where({
		'id': batch_id,
	}).select(
		'title AS title',
		'user_id AS user_id',
	).first().catch((err)=>{if (err) err_code = err.code});
	
	if (err_code || !batch) return [false, null];
	
	return [true, batch];
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
    db_updateBouncerBatchProcessed,
    
    // Result Processing (Fire-and-Forget)
    db_processBouncerResults,
    
    // Rate Limiting
    db_checkRateLimit,
    db_recordRateLimit,
};