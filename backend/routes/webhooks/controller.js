// Dependencies
const HttpStatus = require('../../types/HttpStatus');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { handleSuccessfulPayment, handleSuccessfulCatchallPayment, handleIncomingResults } = require('./funs_db');
const knex = require('knex')(require('../../knexfile.js').development);

const result_map = ["invalid", "catchall", "valid"];

/**
 * Handle Stripe webhook events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (!sig) {
            return res.status(HttpStatus.FAILED_STATUS).json({
                error: 'Missing Stripe signature'
            });
        }

        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(HttpStatus.FAILED_STATUS).json({
            error: 'Invalid signature'
        });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                
                // Verify the session is paid
                if (session.payment_status !== 'paid') {
                    console.error('Session not paid:', session.id);
                    return res.status(HttpStatus.FAILED_STATUS).json({
                        error: 'Session not paid'
                    });
                }

                // Get the user ID from our database using the Stripe customer ID
                const user = await knex('Users')
                    .where('stripe_id', session.customer)
                    .select('id')
                    .first();

                if (!user) {
                    console.error('User not found for customer:', session.customer);
                    return res.status(HttpStatus.FAILED_STATUS).json({
                        error: 'User not found'
                    });
                }

                const userId = user.id;

                // Get the product details from both tables
                let product = null;
                let isCatchall = false;

                // First check regular products
                let query = knex('Stripe_Products').where('product_id', session.metadata.product_id);
                if (process.env.NODE_ENV === 'development') {
                    query = query.andWhere('is_live', 0);
                } else {
                    query = query.andWhere('is_live', 1);
                }
                product = await query.select('credits').first();

                if (!product) {
                    // Check if it's a catchall product
                    let catchallQuery = knex('Stripe_Catchall_Products').where('product_id', session.metadata.product_id);
                    if (process.env.NODE_ENV === 'development') {
                        catchallQuery = catchallQuery.andWhere('is_live', 0);
                    } else {
                        catchallQuery = catchallQuery.andWhere('is_live', 1);
                    }
                    product = await catchallQuery.select('credits').first();
                    isCatchall = true;

                    if (!product) {
                        console.error('Product not found:', session.metadata.product_id);
                        return res.status(HttpStatus.FAILED_STATUS).json({
                            error: 'Product not found'
                        });
                    }
                }

                // Handle the payment based on type
                if (isCatchall) {
                    // Update the purchase record with correct credits
                    await knex('Stripe_Catchall_Purchases')
                        .where('session_id', session.id)
                        .update({ 
                            credits: product.credits,
                            status: 'completed'
                        });
                    
                    await handleSuccessfulCatchallPayment(userId, product.credits, session.id);
                } else {
                    // Update the purchase record with correct credits
                    await knex('Stripe_Purchases')
                        .where('session_id', session.id)
                        .update({ 
                            credits: product.credits,
                            status: 'completed'
                        });
                    
                    await handleSuccessfulPayment(userId, product.credits, session.id);
                }

                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });
            }

            case 'checkout.session.expired':
                console.log('Checkout session expired:', event.data.object.id);
                break;
            case 'payment_intent.succeeded':
                console.log('Payment succeeded:', event.data.object.id);
                break;
            case 'payment_intent.payment_failed':
                console.log('Payment failed:', event.data.object.id);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });
        }
    } catch (err) {
        console.error('Error processing webhook:', err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).json({
            error: 'Webhook handler failed'
        });
    }
}

async function handleResults(req, res) {

    try {
        const { id, results } = req.body;
        if (!id || !results) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Missing required fields: id and results'
            });
        }
        const resultsArray = Array.isArray(results) ? results : [results];
        const resp = await handleIncomingResults(id, resultsArray); // handle the results
        return (resp) ? res.status(HttpStatus.SUCCESS_STATUS) : res.status(HttpStatus.INTERNAL_SERVER_ERROR)
    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS)
    }
}


module.exports = {
    handleWebhook,
    handleResults,
}; 