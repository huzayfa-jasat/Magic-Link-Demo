// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// -------------------
// READ Functions
// -------------------

/**
 * Get user credit balance
 */
async function db_getUserCredits(user_id) {
    let err_code;
    const db_resp = await knex('Users_Credit_Balance')
        .select('current_balance')
        .where('user_id', user_id)
        .first()
        .catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];
    return [true, db_resp?.current_balance || 0];
}

/**
 * Validate emails and return results
 */
async function db_validateEmails(user_id, emails) {
    let err_code;
    
    // Check user has enough credits
    const [creditsOk, currentBalance] = await db_getUserCredits(user_id);
    if (!creditsOk) return [false, null];
    
    if (currentBalance < emails.length) {
        return [false, { error: 'Insufficient credits', required: emails.length, available: currentBalance }];
    }

    // Get existing results from Contacts_Global
    const existingResults = await knex('Contacts_Global')
        .whereIn('email', emails)
        .select('email', 'latest_result', 'last_mail_server')
        .catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    // Create results map
    const resultsMap = {};
    existingResults.forEach(result => {
        resultsMap[result.email] = {
            email: result.email,
            status: result.latest_result,
            mail_server: result.last_mail_server
        };
    });

    // Add missing emails as 'unknown' status
    emails.forEach(email => {
        if (!resultsMap[email]) {
            resultsMap[email] = {
                email: email,
                status: 'unknown',
                mail_server: 'unknown'
            };
        }
    });

    // Deduct credits
    await knex('Users_Credit_Balance')
        .where('user_id', user_id)
        .decrement('current_balance', emails.length)
        .catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    // Record usage in history
    await knex('Users_Credit_Balance_History').insert({
        user_id: user_id,
        credits_used: emails.length,
        usage_ts: new Date()
    }).catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    return [true, Object.values(resultsMap)];
}

/**
 * Validate emails for catchall detection
 */
async function db_validateCatchall(user_id, emails) {
    let err_code;
    
    // Check user has enough credits (catchall detection costs more)
    const [creditsOk, currentBalance] = await db_getUserCredits(user_id);
    if (!creditsOk) return [false, null];
    
    const creditCost = emails.length * 2; // Catchall detection costs 2 credits per email
    if (currentBalance < creditCost) {
        return [false, { error: 'Insufficient credits', required: creditCost, available: currentBalance }];
    }

    // Get existing results from Contacts_Global
    const existingResults = await knex('Contacts_Global')
        .whereIn('email', emails)
        .select('email', 'latest_result', 'last_mail_server')
        .catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    // Create results map
    const resultsMap = {};
    existingResults.forEach(result => {
        resultsMap[result.email] = {
            email: result.email,
            status: result.latest_result,
            mail_server: result.last_mail_server,
            is_catchall: result.latest_result === 'catch-all'
        };
    });

    // Add missing emails as 'unknown' status
    emails.forEach(email => {
        if (!resultsMap[email]) {
            resultsMap[email] = {
                email: email,
                status: 'unknown',
                mail_server: 'unknown',
                is_catchall: false
            };
        }
    });

    // Deduct credits
    await knex('Users_Credit_Balance')
        .where('user_id', user_id)
        .decrement('current_balance', creditCost)
        .catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    // Record usage in history
    await knex('Users_Credit_Balance_History').insert({
        user_id: user_id,
        credits_used: creditCost,
        usage_ts: new Date()
    }).catch((err) => { if (err) err_code = err.code });
    
    if (err_code) return [false, null];

    return [true, Object.values(resultsMap)];
}

// -------------------
// UPDATE Functions
// -------------------

// -------------------
// DELETE Functions
// -------------------

// ----- Export -----
module.exports = {
    db_getUserCredits,
    db_validateEmails,
    db_validateCatchall
}; 