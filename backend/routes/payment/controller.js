const HttpStatus = require('../../types/HttpStatus');
const { createStripeCustomer, getStripeCustomerId, createCheckoutSession } = require('./funs_db');

// Valid package codes
const VALID_PACKAGES = new Set([
    'starter', 'basic', 'standard', 'pro', 'business', 
    'enterprise', 'elite', 'premium_3m', 'premium_5m', 'ultimate'
]);

/**
 * Create a checkout session for a package
 */
async function createCheckout(req, res) {
    try {
        const { package_code } = req.body;

        // Validate package code
        if (!package_code || !VALID_PACKAGES.has(package_code)) {
            return res.status(HttpStatus.FAILED_STATUS).json({ 
                error: 'Invalid package code',
                validPackages: VALID_PACKAGES
            });
        }

        const userId = req.user.id;

        // Get or create Stripe customer ID
        let stripeCustomerId = await getStripeCustomerId(userId);
        if (!stripeCustomerId) {
            stripeCustomerId = await createStripeCustomer(userId, req.user.email);
        }

        // Create checkout session
        const checkoutUrl = await createCheckoutSession(stripeCustomerId, package_code);

        res.status(HttpStatus.SUCCESS_STATUS).json({ url: checkoutUrl });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(HttpStatus.MISC_ERROR_STATUS).json({ 
            error: 'Internal server error',
            message: 'Failed to create checkout session'
        });
    }
}

module.exports = {
    createCheckout
}; 