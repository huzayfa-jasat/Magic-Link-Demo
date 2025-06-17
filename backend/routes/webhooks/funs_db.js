// Dependencies

const knex = require('knex')(require('../../knexfile.js').development);
const { sendLowCreditsEmail } = require('../../external_apis/resend');

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
            // Check if user already has a balance row
            const existing = await trx('Users_Credit_Balance')
                .where('user_id', userId)
                .first();
            if (existing) {
                // Update user credits
                await trx('Users_Credit_Balance')
                    .where('user_id', userId)
                    .increment('current_balance', credits)
                    .catch((error) => { err = error; });
            } else {
                // Insert new balance row
                await trx('Users_Credit_Balance')
                    .insert({ user_id: userId, current_balance: credits })
                    .catch((error) => { err = error; });
            }
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

        // After transaction, check balance and send low credits email if needed
        const user = await knex('Users').where('id', userId).first();
        const balanceRow = await knex('Users_Credit_Balance').where('user_id', userId).first();
        const balance = balanceRow ? balanceRow.current_balance : 0;
        if (balance < 1000 && user && user.email) {
            await sendLowCreditsEmail(user.email, balance);
        }
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

        const resp = await trx('Contacts_Global')
            .whereIn('email', results.map(result => result.email))
            .select('global_id', 'email')
            .catch((err) => { if (err) err_code = err.code; });


        const GLOBAL_ID_MAP = resp.reduce((acc, currentItem) => {
            acc[currentItem.email] = currentItem.global_id;
            return acc;
        }, {});

        await trx('Requests_Contacts')
            .insert(results.map(result => ({
                request_id: id,
                global_id: GLOBAL_ID_MAP[result.email],
                processed_ts: new Date()
            })))
            .catch((err) => { if (err) err_code = err.code; });

        const [{ num_processed = 0, num_contacts = 0 }] = await trx('Requests')
            .where('request_id', id)
            .select('num_processed', 'num_contacts')
            .catch((err) => { if (err) err_code = err.code; });

        const newProcessed = num_processed + results.length;
        const newStatus = newProcessed >= num_contacts ? 'completed' : 'in_progress';

        await trx('Requests')
            .where('request_id', id)
            .update({
                num_processed: newProcessed,
                request_status: newStatus
            })
            .catch((err) => { if (err) err_code = err.code; });

        await Promise.all(results.map(async (resultItem) => {
            const { email, result, server } = resultItem;

            await trx('Contacts_Global')
                .where('email', email)
                .update({
                    latest_result: result,
                    last_mail_server: server
                })
                .catch((err) => { if (err) err_code = err.code; });
        }));
        return true;
    });

    return trxResult && !err_code ? true : false;

}


module.exports = {
    handleSuccessfulPayment,
    handleIncomingResults
}; 