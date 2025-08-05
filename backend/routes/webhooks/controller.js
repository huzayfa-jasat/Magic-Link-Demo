// Dependencies
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Type Imports
const HttpStatus = require('../../types/HttpStatus');

// DB Function Imports
const { db_processCheckoutSession, db_processSubscriptionEvents } = require('./funs_db');

/**
 * Handle Stripe webhook events
 */
async function handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (!sig) {
            return res.status(HttpStatus.FAILED_STATUS).send('Missing Stripe signature');
        }

        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(HttpStatus.FAILED_STATUS).send('Invalid signature');
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;

                // Verify the session is paid
                if (session.payment_status !== 'paid') {
                    return res.status(HttpStatus.FAILED_STATUS).send('Session not paid');
                }
                
                // Process the checkout session
                const [success, result] = await db_processCheckoutSession(
                    session.id,
                    session.customer,
                    session.metadata.product_id
                );
                
                if (!success) {
                    console.error('Failed to process checkout session:', result);
                    return res.status(HttpStatus.FAILED_STATUS).send(result);
                }

                console.log('Successfully processed checkout session:', result.message);
                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });

            // Subscription events
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
            case 'invoice.payment_succeeded':
                const [subSuccess, subResult] = await db_processSubscriptionEvents(event);
                
                if (!subSuccess) {
                    console.error('Failed to process subscription event:', subResult);
                    return res.status(HttpStatus.FAILED_STATUS).send(subResult);
                }

                console.log('Successfully processed subscription event:', event.type);
                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });

            default:
                console.log(`Unhandled event type: ${event.type}`);
                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });
        }
    } catch (err) {
        console.error('Error processing webhook:', err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send('Webhook handler failed');
    }
}

// Export
module.exports = {
    handleStripeWebhook,
}; 