// Dependencies

const knex = require('knex')(require('../../knexfile.js').development);

/**
 * Handle successful payment and update user credits
 * @param {number} userId - The user's ID
 * @param {number} credits - Number of credits to add
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<void>}
 */
async function handleSuccessfulPayment(userId, credits, sessionId) {
    let err;
    try {
        // Start a transaction
        await knex.transaction(async (trx) => {
            // Update user credits
            await trx('Users')
                .where('id', userId)
                .increment('credits', credits)
                .catch((error) => { err = error; });

            if (err) throw err;

            // Record the purchase
            await trx('Stripe_Purchases').insert({
                user_id: userId,
                session_id: sessionId,
                credits: credits,
                status: 'completed',
                created_at: new Date()
            }).catch((error) => { err = error; });

            if (err) throw err;
        });
    } catch (error) {
        console.error('Error handling successful payment:', error);
        throw error;
    }
}

/**
 * 
 * @param {number} id 
 * @param {string} email 
 * @param {string} result 
 * @param {string} server 
 */

async function handleIncomingResults(id, email, result, server) {
    let err;

    // Update request status
    const db_resp = await knex('Requests')
        .where('request_id', id)
        .increment('num_processed', 1)
        .update({
            'request_status': knex.raw('IF(num_processed = num_contacts, "completed", request_status)')
        })
        .catch((error) => { err = error; });

    // Update global contact
    const updateResp = await knex('Contacts_Global')
        .where('email', email)
        .update({
            'latest_result': result,
            'last_mail_server': server
        })
        .catch((error) => { err = error; });

    if (err) {
        console.error('Error updating global contact:', err);
        throw err;
    }

    return [true, db_resp, updateResp];
}

module.exports = {
    handleSuccessfulPayment,
    handleIncomingResults
}; 