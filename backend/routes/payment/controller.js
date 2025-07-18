// Type Imports
const HttpStatus = require('../../types/HttpStatus');

// DB Function Imports
const {
    db_getPackagesList,
    db_getProductByPackageCode,
    db_recordPendingPurchase,
    createStripeCustomer,
    getStripeCustomerId,
    createCheckoutSession
} = require('./funs_db');


/**
 * Get packages list
 */
async function getPackages(req, res) {
    try {
        const [ok, data] = await db_getPackagesList();
        if (!ok) return res.status(HttpStatus.FAILED_STATUS).send("Failed to get packages list");
        res.status(HttpStatus.SUCCESS_STATUS).json(data);
    } catch (error) {
        console.error("Error getting packages list:", error);
        res.status(HttpStatus.MISC_ERROR_STATUS).send("Misc Error");
    }
}

/**
 * Create a checkout session for a package
 */
async function createCheckout(req, res) {
    try {
        const { package_code } = req.body;

        // Validate req body
        if (!package_code) {
            return res.status(HttpStatus.FAILED_STATUS).send('Package code is required');
        }

        // Validate package exists
        const [productExists, product] = await db_getProductByPackageCode(package_code);
        if (!productExists || !product) {
            return res.status(HttpStatus.FAILED_STATUS).send('Invalid package');
        }

        // Check if package is catchall
        const isCatchall = product.credit_type === 'catchall';

        // Get or create Stripe customer ID
        let stripeCustomerId = await getStripeCustomerId(req.user.id);
        if (!stripeCustomerId) {
            stripeCustomerId = await createStripeCustomer(req.user.id);
        }

        // Create checkout session
        const { url: checkoutUrl, sessionId } = await createCheckoutSession(stripeCustomerId, package_code);

        // Record the purchase attempt
        const [recordSuccess, recordError] = await db_recordPendingPurchase(req.user.id, sessionId, isCatchall);
        if (!recordSuccess) {
            console.error('Error recording purchase attempt:', recordError);
            return res.status(HttpStatus.FAILED_STATUS).send(recordError);
        }

        // Only return JSON for success status
        res.status(HttpStatus.SUCCESS_STATUS).json({ 
            url: checkoutUrl,
            data: {
                message: `${isCatchall ? 'Catchall' : 'Regular'} purchase initiated`,
                packageCode: package_code,
                creditType: product.credit_type,
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(HttpStatus.MISC_ERROR_STATUS).send('Failed to create checkout session');
    }
}

module.exports = {
    getPackages,
    createCheckout
}; 