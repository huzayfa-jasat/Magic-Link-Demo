// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const { getBatchTableName } = require('../batches/funs_db_utils.js');

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
    
    // TODO

    return [false, null];
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
    db_validateEmails,
    db_validateCatchall
}; 