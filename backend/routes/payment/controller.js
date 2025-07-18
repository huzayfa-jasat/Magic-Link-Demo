const HttpStatus = require('../../types/HttpStatus');
const { createStripeCustomer, getStripeCustomerId, createCheckoutSession } = require('./funs_db');
const knex = require('knex')(require('../../knexfile.js').development);

// Valid package codes
const VALID_PACKAGES = new Set([
    'starter', 'basic', 'standard', 'pro', 'business', 
    'enterprise', 'elite', 'premium_3m', 'premium_5m', 'ultimate'
]);

// Valid catchall package codes
const VALID_CATCHALL_PACKAGES = [
    'catchall_10k', 'catchall_25k', 'catchall_50k', 'catchall_100k', 
    'catchall_250k', 'catchall_500k', 'catchall_1m'
];

/**
 * Create a checkout session for a package
 */
async function createCheckout(req, res) {
    try {
        const { package_code } = req.body;

        if (!packageCode) {
            return res.status(HttpStatus.FAILED_STATUS).json({ 
                error: 'Package code is required'
            });
        }

        // Check if package exists in database and get its type
        let query = knex('Stripe_Products').where('package_code', packageCode);
        if (process.env.NODE_ENV === 'development') {
            query = query.andWhere('is_live', 0);
        } else {
            query = query.andWhere('is_live', 1);
        }
        const product = await query.select('credit_type').first();

        if (!product) {
            return res.status(HttpStatus.FAILED_STATUS).json({ 
                error: 'Invalid package code',
                message: 'Package not found in database'
            });
        }

        const isCatchall = product.credit_type === 'catchall';

        const userId = req.user.id;

        // Get or create Stripe customer ID
        let stripeCustomerId = await getStripeCustomerId(userId);
        if (!stripeCustomerId) {
            stripeCustomerId = await createStripeCustomer(userId, req.user.email);
        }

        // Create checkout session
        const { url: checkoutUrl, sessionId } = await createCheckoutSession(stripeCustomerId, packageCode);

        // Record the purchase attempt in the database
        let err;
        if (isCatchall) {
            await knex('Stripe_Catchall_Purchases').insert({
                user_id: userId,
                session_id: sessionId,
                credits: 0, // Will be updated by webhook
                status: 'pending',
                created_at: new Date()
            }).catch((error) => { err = error; });
        } else {
            await knex('Stripe_Purchases').insert({
                user_id: userId,
                session_id: sessionId,
                credits: 0, // Will be updated by webhook
                status: 'pending',
                created_at: new Date()
            }).catch((error) => { err = error; });
        }

        if (err) {
            console.error('Error recording purchase attempt:', err);
            return res.status(HttpStatus.FAILED_STATUS).send("Failed to record purchase attempt");
        }

        res.status(HttpStatus.SUCCESS_STATUS).json({ 
            url: checkoutUrl,
            data: {
                message: `${isCatchall ? 'Catchall' : 'Regular'} purchase initiated`,
                packageCode: packageCode,
                creditType: product.credit_type,
                status: 'pending'
            }
        });
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