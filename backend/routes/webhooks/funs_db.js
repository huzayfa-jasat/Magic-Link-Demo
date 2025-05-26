// Dependencies
const db = require('../../utils/db');

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
        await db.transaction(async (trx) => {
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

    try {

        await db('Requests')
            .where('request_id', id)
            .increment('num_processed', 1)
            .update({
                'request_status': db.raw('IF(num_processed = num_contacts, "completed", request_status)')
            })
            .catch((error) => { err = error; });

        if (err) throw err;

        // Update global contact
        await db('Contacts_Global')
            .where('email', email)
            .update({
                'latest_result': result,
                'last_mail_server': server
            })
            .catch((error) => { err = error; });

        if (err) throw err;
    }

    catch (error) {
        console.error('Error handling incoming results:', error);
        throw error;
    }

}

module.exports = {
    handleSuccessfulPayment,
    handleIncomingResults
}; 