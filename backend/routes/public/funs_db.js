// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const {
    getBatchTableName, getResultsTableName, getEmailBatchAssociationTableName,
    formatResultsByCheckType
} = require('../batches/funs_db_utils.js');

// -------------------
// READ Functions
// -------------------

async function db_getUserIdFromApiKey(api_key) {
    let err_code;
    const user = await knex('Users').where('api_key', api_key).select('id').first().catch((err)=>{if (err) err_code = err.code});
    if (err_code || !user) return [false, null];
    return [true, user.id];
}

/**
 * Get user credit balance
 */
async function db_getUserCredits(user_id) {
    let err_code;

    // Promise both queries at same time
    const [db_resp_valid, db_resp_catchall] = await Promise.all([
        knex('Users_Credit_Balance').where('user_id', user_id).select('current_balance').first().catch((err)=>{if (err) err_code = err.code}),
        knex('Users_Catchall_Credit_Balance').where('user_id', user_id).select('current_balance').first().catch((err)=>{if (err) err_code = err.code})
    ]);
    if (err_code) return [false, null];
    
    // Format & return
    return [true, {
        deliverability: db_resp_valid?.current_balance || 0,
        catchall: db_resp_catchall?.current_balance || 0
    }];
}

async function db_getBatchStatus(batch_id, check_type) {
    let err_code;

    // Get batch table name
    const batch_table = getBatchTableName(check_type);
    if (!batch_table) return [false, null];
    
    // Get status
    const resp = await knex(batch_table).where({
        'id': batch_id
    }).select('status').first().catch((err)=>{if (err) err_code = err.code});
    if (err_code || !resp) return [false, null];

    // Mask 'queued' as 'processing'
    const status = (resp.status === 'queued') ? 'processing' : resp.status;

    // Return status
    return [true, status];
}

async function db_downloadBatchResults(batch_id, check_type) {
    let err_code;

    // Get table names
    const batch_table = getBatchTableName(check_type);
    const results_table = getResultsTableName(check_type);
    const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
    if (!batch_table || !results_table || !email_batch_association_table) return [false, null];

    // Get results columns based on check_type
    let results_columns;
    switch (check_type) {
        case 'deliverable':
            results_columns = ['email_nominal', 'status', 'reason', 'is_catchall', 'score', 'provider'];
            break;
        case 'catchall':
            // results_columns = ['email_nominal', 'toxicity'];
            results_columns = ['email_nominal', 'status', 'reason', 'is_catchall', 'score', 'provider'];
            break;
        default:
            return [false, null];
    }

    // Query all results for the batch
    const results = await knex(results_table).join(
        email_batch_association_table,
        `${email_batch_association_table}.email_global_id`,
        `${results_table}.email_global_id`
    ).where({
        [`${email_batch_association_table}.batch_id`]: batch_id,
        [`${email_batch_association_table}.did_complete`]: 1,
    }).select(
        results_columns
    ).catch((err)=>{if (err) err_code = err.code});
    
    if (err_code) return [false, null];

    // Format results based on check_type
    const formatted_results = formatResultsByCheckType(results, check_type);

    return [true, formatted_results];
}

// -------------------
// UPDATE Functions
// -------------------

// -------------------
// DELETE Functions
// -------------------

// ----- Export -----
module.exports = {
    db_getUserIdFromApiKey,
    db_getUserCredits,
    db_getBatchStatus,
    db_downloadBatchResults
}; 