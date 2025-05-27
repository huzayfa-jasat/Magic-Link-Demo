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
 * Handle incoming verification results (supports multiple results)
 * @param {number} id - Request ID
 * @param {Array} results - Array of result objects or single result object
 * @returns {Promise<boolean>} - Returns true if successful, false if an error occurred
 * Each result object should have: { email, result, server }
 */
async function handleIncomingResults(id, results) {
    let err_code
   
    const trxResult = await knex.transaction(async (trx) => {
        const [{ num_processed = 0, num_contacts = 0 }] = await trx('Requests')
            .where('request_id', id)
            .select('num_processed', 'num_contacts')
            .catch((err) => { if (err) err_code = err.code; });

        const newProcessed = num_processed + resultsArray.length;
        const newStatus = newProcessed >= num_contacts ? 'completed' : 'in_progress';

        await trx('Requests')
            .where('request_id', id)
            .update({
                num_processed: newProcessed,
                request_status: newStatus
            })
            .catch((err) => { if (err) err_code = err.code; });

        for (const resultItem of resultsArray) {
            const { email, result, server } = resultItem;

            await trx('Contacts_Global')
                .where('email', email)
                .update({
                    latest_result: result,
                    last_mail_server: server
                })
                .catch((err) => { if (err) err_code = err.code; });
        }
        return true;
    });

    return trxResult && !err_code ? true : false;
    
}


module.exports = {
    handleSuccessfulPayment,
    handleIncomingResults
}; 