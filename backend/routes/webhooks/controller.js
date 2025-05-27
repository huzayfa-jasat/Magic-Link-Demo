// Dependencies
const HttpStatus = require('../../types/HttpStatus');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { handleSuccessfulPayment, handleIncomingResults } = require('./funs_db');

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
            return res.status(HttpStatus.BAD_REQUEST).json({
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
        return res.status(HttpStatus.BAD_REQUEST).json({
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
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        error: 'Session not paid'
                    });
                }

                // Get the customer
                const customer = await stripe.customers.retrieve(session.customer);
                if (!customer || !customer.metadata.userId) {
                    console.error('Invalid customer:', session.customer);
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        error: 'Invalid customer'
                    });
                }

                // Get the product details
                const product = await db('Stripe_Products')
                    .where('product_id', session.metadata.product_id)
                    .select('credits')
                    .first();

                if (!product) {
                    console.error('Product not found:', session.metadata.product_id);
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        error: 'Product not found'
                    });
                }

                // Update user credits
                await handleSuccessfulPayment(
                    parseInt(customer.metadata.userId),
                    product.credits,
                    session.id
                );

                return res.status(HttpStatus.OK).json({ received: true });
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
                return res.status(HttpStatus.OK).json({ received: true });
        }
    } catch (err) {
        console.error('Error processing webhook:', err);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
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
    handleResults
}; 