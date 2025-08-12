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
            console.error('Missing Stripe signature');
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
                    console.error('Session not paid:', session.payment_status);
                    // return res.status(HttpStatus.FAILED_STATUS).send('Session not paid');
                    return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });
                }
                
                // Process the checkout session
                if ('metadata' in session && 'product_id' in session.metadata) {
                    const [success, result] = await db_processCheckoutSession(
                        session.id,
                        session.customer,
                        session.metadata.product_id
                    );
                
                    if (!success) {
                        console.error('Failed to process checkout session:', result);
                        return res.status(HttpStatus.FAILED_STATUS).send(result);
                    }
                }
                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });

            // Subscription events
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
            case 'customer.subscription.trial_will_end':
            case 'invoice.payment_succeeded':
            case 'invoice_payment.paid':
                const [subSuccess, subResult] = await db_processSubscriptionEvents(event);
                
                if (!subSuccess) {
                    console.error('Failed to process subscription event:', subResult);
                    return res.status(HttpStatus.FAILED_STATUS).send(subResult);
                }

                return res.status(HttpStatus.SUCCESS_STATUS).json({ received: true });

            default:
                // For unhandled events, just return success without logging
                // These are events we don't need to process but aren't errors
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