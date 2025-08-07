// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const { db_processPendingReferralsForUser } = require('../credits/funs_db');


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
        // Check if user is now eligible for pending referrals
        await db_processPendingReferralsForUser(userId);
        
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
                created_at: knex.fn.now()
            }).catch((error) => { err = error; });
            
            await trx('Users_Catchall_Credit_Balance_History').insert({
                user_id: userId,
                credits_used: credits,
                event_typ: 'purchase'
            }).catch((error) => { err = error; });

            if (err) throw err;
        });

        console.log(`[${userId}] Added ${credits} catchall credits from purchase`);
        
        // Check if user is now eligible for pending referrals
        await db_processPendingReferralsForUser(userId);
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


/**
 * Process subscription events from Stripe webhook
 * @param {Object} event - The Stripe event object
 * @returns {Promise<[boolean, object|string]>} Success status and result/error
 */
async function db_processSubscriptionEvents(event) {
    const subscriptionDB = require('../subscriptions/funs_db');
    
    try {
        switch (event.type) {
            case 'customer.subscription.created':
                return await handleSubscriptionCreated(event.data.object);
                
            case 'invoice.payment_succeeded':
            case 'invoice_payment.paid':
                // This is where monthly credit renewal happens
                return await handleInvoicePaymentSucceeded(event.data.object);
                
            case 'customer.subscription.updated':
                return await handleSubscriptionUpdated(event.data.object);
                
            case 'customer.subscription.deleted':
                return await handleSubscriptionDeleted(event.data.object);
                
            default:
                console.log('⚠️ Unknown subscription event type:', event.type);
                return [false, 'Unknown subscription event type'];
        }
    } catch (error) {
        console.error('❌ Error processing subscription event:', error);
        return [false, error.message];
    }
}

/**
 * Handle new subscription creation
 */
async function handleSubscriptionCreated(subscription) {
    const subscriptionDB = require('../subscriptions/funs_db');
    
    try {
        // Get user by Stripe customer ID
        const user = await knex('Users')
            .where('stripe_id', subscription.customer)
            .first();
            
        if (!user) {
            console.error('User not found for customer:', subscription.customer);
            return [false, 'User not found for customer'];
        }
        
        // Get plan by Stripe price ID
        const priceId = subscription.items.data[0].price.id;
        
        const plan = await subscriptionDB.db_getSubscriptionPlanByPriceId(priceId);
        
        if (!plan) {
            console.error('Subscription plan not found for price ID:', priceId);
            return [false, 'Subscription plan not found'];
        }
        
        // Create subscription record
        await knex.transaction(async (trx) => {
            // Insert subscription record
            await subscriptionDB.db_upsertUserSubscription({
                user_id: user.id,
                subscription_type: subscription.metadata?.subscription_type || plan.subscription_type,
                subscription_plan_id: plan.id,
                stripe_subscription_id: subscription.id,
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000),
                current_period_end: new Date(subscription.current_period_end * 1000),
                cancel_at_period_end: subscription.cancel_at_period_end || false
            }, trx);
            
            // Allocate initial credits
            await subscriptionDB.db_allocateSubscriptionCredits(
                user.id,
                plan.id,
                new Date(subscription.current_period_end * 1000),
                trx
            );
        });
        
        return [true, { message: 'Subscription created successfully', userId: user.id }];
    } catch (error) {
        console.error('Error handling subscription creation:', error);
        return [false, error.message];
    }
}

/**
 * Handle successful invoice payment (monthly renewal)
 */
async function handleInvoicePaymentSucceeded(invoice) {
    const subscriptionDB = require('../subscriptions/funs_db');
    
    try {
        // Only process subscription invoices
        if (!invoice.subscription) {
            return [true, { message: 'Not a subscription invoice' }];
        }
        
        // Validate invoice structure
        if (!invoice.lines || !invoice.lines.data || !invoice.lines.data[0]) {
            console.error('Invalid invoice structure - missing lines data');
            return [false, 'Invalid invoice structure'];
        }
        
        const lineItem = invoice.lines.data[0];
        if (!lineItem.period || !lineItem.period.end) {
            console.error('Invalid line item structure - missing period data');
            return [false, 'Invalid line item structure'];
        }
        
        // Get user by Stripe customer ID
        const user = await knex('Users')
            .where('stripe_id', invoice.customer)
            .first();
            
        if (!user) {
            console.error('User not found for customer:', invoice.customer);
            return [false, 'User not found for customer'];
        }
        
        // Get subscription by Stripe subscription ID
        const subscription = await knex('User_Subscriptions')
            .where('stripe_subscription_id', invoice.subscription)
            .first();
        
        if (!subscription) {
            console.error('Subscription not found for subscription ID:', invoice.subscription);
            return [false, 'Subscription not found'];
        }
        
        // Extract period end from invoice lines
        const periodEnd = lineItem.period.end;
        
        await knex.transaction(async (trx) => {
            // Update subscription period
            await trx('User_Subscriptions')
                .where('id', subscription.id)
                .update({
                    current_period_end: new Date(periodEnd * 1000),
                    updated_ts: knex.fn.now()
                });
            
            // Allocate new credits for the period
            await subscriptionDB.db_allocateSubscriptionCredits(
                user.id,
                subscription.subscription_plan_id,
                new Date(periodEnd * 1000),
                trx
            );
        });
        
        return [true, { message: 'Subscription renewed successfully', userId: user.id }];
    } catch (error) {
        console.error('Error handling invoice payment:', error);
        return [false, error.message];
    }
}

/**
 * Handle subscription updates (status changes, plan changes, cancellations)
 */
async function handleSubscriptionUpdated(subscription) {
    const subscriptionDB = require('../subscriptions/funs_db');
    
    try {
        // Get user by Stripe customer ID
        const user = await knex('Users')
            .where('stripe_id', subscription.customer)
            .first();
            
        if (!user) {
            return [false, 'User not found for customer'];
        }
        
        // Get the existing subscription to preserve subscription_type
        const existingSubscription = await knex('User_Subscriptions')
            .where('stripe_subscription_id', subscription.id)
            .first();
            
        if (!existingSubscription) {
            return [false, 'Subscription not found in database'];
        }
        
        // Update subscription record
        await subscriptionDB.db_upsertUserSubscription({
            user_id: user.id,
            subscription_type: existingSubscription.subscription_type,
            subscription_plan_id: existingSubscription.subscription_plan_id,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
        });
        
        return [true, { message: 'Subscription updated successfully', userId: user.id }];
    } catch (error) {
        console.error('Error handling subscription update:', error);
        return [false, error.message];
    }
}

/**
 * Handle subscription deletion (after cancellation period)
 */
async function handleSubscriptionDeleted(subscription) {
    const subscriptionDB = require('../subscriptions/funs_db');
    
    try {
        // Get user by Stripe customer ID
        const user = await knex('Users')
            .where('stripe_id', subscription.customer)
            .first();
            
        if (!user) {
            return [false, 'User not found for customer'];
        }
        
        // Get the subscription to find its type
        const existingSubscription = await knex('User_Subscriptions')
            .where('stripe_subscription_id', subscription.id)
            .first();
            
        if (!existingSubscription) {
            return [false, 'Subscription not found in database'];
        }
        
        // Update subscription status to canceled
        await subscriptionDB.db_updateSubscriptionStatus(user.id, existingSubscription.subscription_type, 'canceled');
        
        // Credits will naturally expire based on expiry_ts
        
        return [true, { message: 'Subscription deleted successfully', userId: user.id }];
    } catch (error) {
        console.error('Error handling subscription deletion:', error);
        return [false, error.message];
    }
}

module.exports = {
    db_processCheckoutSession,
    db_processSubscriptionEvents,
}; 