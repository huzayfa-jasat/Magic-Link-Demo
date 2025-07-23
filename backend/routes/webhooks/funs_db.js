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
                status: 'completed'
            }).catch((error) => { err = error; });
            await trx('Users_Credit_Balance_History').insert({
                user_id: userId,
                credits_used: credits,
                event_typ: 'purchase'
            }).catch((error) => { err = error; });

            if (err) throw err;
        });

        // Transaction completed successfully
        
    } catch (error) {
        console.error('Error handling successful payment:', error);
        throw error;
    }
}

/**
 * Handle successful catchall payment and update user catchall credits
 * @param {number} userId - The user's ID
 * @param {number} credits - Number of catchall credits to add
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<void>}
 */
async function handleSuccessfulCatchallPayment(userId, credits, sessionId) {
    let err;
    try {
        // Start a transaction
        await knex.transaction(async (trx) => {
            // Check if user already has a catchall balance row
            const existing = await trx('Users_Catchall_Credit_Balance')
                .where('user_id', userId)
                .first();
            if (existing) {
                // Update user catchall credits
                await trx('Users_Catchall_Credit_Balance')
                    .where('user_id', userId)
                    .increment('current_balance', credits)
                    .catch((error) => { err = error; });
            } else {
                // Insert new catchall balance row
                await trx('Users_Catchall_Credit_Balance')
                    .insert({ user_id: userId, current_balance: credits })
                    .catch((error) => { err = error; });
            }
            if (err) throw err;

            // Record the catchall purchase
            await trx('Stripe_Catchall_Purchases').insert({
                user_id: userId,
                session_id: sessionId,
                credits: credits,
                status: 'completed',
                created_at: new Date()
            }).catch((error) => { err = error; });

            if (err) throw err;
        });

        console.log(`[${userId}] Added ${credits} catchall credits from purchase`);
    } catch (error) {
        console.error('Error handling successful catchall payment:', error);
        throw error;
    }
}

/**
 * Process a completed checkout session from Stripe webhook
 * @param {Object} session - The Stripe checkout session object
 * @returns {Promise<[boolean, object|string]>} Success status and result/error
 */
async function db_processCheckoutSession(stripe_session_id, stripe_customer_id, stripe_product_id) {
    let err_code;

    // Get the user ID matching the Stripe customer ID
    const user = await knex('Users').where(
        'stripe_id', stripe_customer_id
    ).select(
        'id'
    ).first().catch((err) => { if (err) err_code = err.code; });
    if (err_code || !user) return [false, null];
    const userId = user.id;

    // Get the product details from unified Stripe_Products table
    const product = await knex('Stripe_Products').where({
        product_id: stripe_product_id,
        is_live: (process.env.NODE_ENV === 'development') ? 0 : 1
    }).select(
        'credits', 'credit_type'
    ).first().catch((err) => { if (err) err_code = err.code; });
    if (err_code || !product) return [false, null];
    const isCatchall = product.credit_type === 'catchall';

    // Update the purchase record with correct credits
    await knex((isCatchall) ?
        'Stripe_Catchall_Purchases' : 'Stripe_Purchases'
    ).where(
        'session_id', stripe_session_id
    ).update({ 
        credits: product.credits,
        status: 'completed'
    }).catch((err) => { if (err) err_code = err.code; });
    if (err_code) return [false, null];

    // Handle the payment based on type
    if (isCatchall) await handleSuccessfulCatchallPayment(userId, product.credits, stripe_session_id);
    else await handleSuccessfulPayment(userId, product.credits, stripe_session_id);

    // Return
    return [true, { 
        userId, 
        credits: product.credits, 
        isCatchall,
        message: `Successfully processed ${isCatchall ? 'catchall' : 'regular'} payment`
    }];
}


module.exports = {
    db_processCheckoutSession,
    handleSuccessfulPayment,
    handleSuccessfulCatchallPayment,
    handleIncomingResults
}; 