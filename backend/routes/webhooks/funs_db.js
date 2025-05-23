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

module.exports = {
    handleSuccessfulPayment
}; 