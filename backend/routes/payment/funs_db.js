// Dependencies
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const knex = require('knex')(require('../../knexfile.js').development);

/**
 * Get packages list
 */
async function db_getPackagesList() {
    let err_code;

    // Get packages
    let packages = await knex('Stripe_Products').select(
        'package_code AS id',
        'display_title AS name',
        'display_bonus AS bonus',
        'display_total AS total',
        'display_amount AS amount',
        'display_price AS price',
        'credit_type AS credit_type',
    ).where({
        is_live: (process.env.NODE_ENV === 'development') ? 0 : 1
    }).catch((err) => { if (err) err_code = err.code });
    if (err_code) return [false, null];

    // Group packages by type
    const validatePackages = [];
    const catchallPackages = [];
    packages.forEach((pkg) => {
        // Remove credit_type from each package
        const { credit_type, ...rest } = pkg;
        if (credit_type === 'default') validatePackages.push(rest);
        else if (credit_type === 'catchall') catchallPackages.push(rest);
    });

    // Return packages grouped by type
    return [true, {
        validate: validatePackages,
        catchall: catchallPackages
    }];
}

/**
 * Create a Stripe customer for a user
 * @param {number} userId - The user's ID
 * @returns {Promise<string>} The Stripe customer ID
 */
async function createStripeCustomer(userId) {
    try {
        // Fetch user email
        const user = await knex('Users').where('id', userId).select('email').first();
        if (!user) throw new Error('User not found');

        // Create stripe customer
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
                userId: userId
            }
        });

        // Update user with Stripe ID
        await knex('Users').where('id', userId).update({ stripe_id: customer.id });
        
        // Return
        return customer.id;

    } catch (error) {
        console.error('Error creating Stripe customer:', error);
        throw error;
    }
}

/**
 * Get Stripe customer ID for a user
 * @param {number} userId - The user's ID
 * @returns {Promise<string|null>} The Stripe customer ID or null if not found
 */
async function getStripeCustomerId(userId) {
    let err;
    try {
        const user = await knex('Users')
            .where('id', userId)
            .select('stripe_id')
            .first()
            .catch((error) => { err = error; });

        if (err) throw err;
        return user?.stripe_id || null;
    } catch (error) {
        console.error('Error getting Stripe customer ID:', error);
        throw error;
    }
}

/**
 * Get product by package code
 * @param {string} packageCode - The package code
 * @returns {Promise<[boolean, object|null]>} Success status and product data
 */
async function db_getProductByPackageCode(packageCode) {
    let err;
    try {
        let query = knex('Stripe_Products').where('package_code', packageCode);
        if (process.env.NODE_ENV === 'development') {
            query = query.andWhere('is_live', 0);
        } else {
            query = query.andWhere('is_live', 1);
        }
        const product = await query.select('product_id', 'price_id', 'credits', 'credit_type').first()
            .catch((error) => { err = error; });

        if (err) return [false, null];
        if (!product) return [false, null];
        
        return [true, product];
    } catch (error) {
        console.error('Error getting product:', error);
        return [false, null];
    }
}

/**
 * Record a pending purchase
 * @param {number} userId - The user ID
 * @param {string} sessionId - The Stripe session ID
 * @param {boolean} isCatchall - Whether this is a catchall purchase
 * @returns {Promise<[boolean, string|null]>} Success status and error message if failed
 */
async function db_recordPendingPurchase(userId, sessionId, isCatchall) {
    let err;
    try {
        const tableName = isCatchall ? 'Stripe_Catchall_Purchases' : 'Stripe_Purchases';
        
        await knex(tableName).insert({
            user_id: userId,
            session_id: sessionId,
            credits: 0, // Will be updated by webhook
            status: 'pending',
            created_at: new Date()
        }).catch((error) => { err = error; });

        if (err) return [false, 'Failed to record purchase attempt'];
        return [true, null];
    } catch (error) {
        console.error('Error recording purchase:', error);
        return [false, 'Failed to record purchase attempt'];
    }
}

/**
 * Create a Stripe checkout session
 * @param {string} stripeCustomerId - The Stripe customer ID
 * @param {string} packageCode - The package code
 * @returns {Promise<{url: string, sessionId: string}>} The checkout session URL and session ID
 */
async function createCheckoutSession(stripeCustomerId, packageCode) {
    let err;
    try {
        // Get product and price ID from unified Stripe_Products table
        let query = knex('Stripe_Products').where('package_code', packageCode);
        if (process.env.NODE_ENV === 'development') {
            query = query.andWhere('is_live', 0);
        } else {
            query = query.andWhere('is_live', 1);
        }
        const product = await query.select('product_id', 'price_id', 'credits', 'credit_type').first().catch((error) => { err = error; });

        if (err) throw err;
        if (!product) throw new Error('Invalid package code');

        // Determine credit type from database column
        const creditType = product.credit_type === 'catchall' ? 'catchall_credits' : 'regular_credits';

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [{
                price: product.price_id,
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL_PREFIX}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL_PREFIX}/payment/cancel`,
            metadata: {
                package_code: packageCode,
                product_id: product.product_id,
                credits: product.credits,
                type: creditType
            }
        });

        return {
            url: session.url,
            sessionId: session.id
        };
    } catch (error) {
        console.error('Error creating checkout session:', error);
        throw error;
    }
}

module.exports = {
    db_getPackagesList,
    db_getProductByPackageCode,
    db_recordPendingPurchase,
    createStripeCustomer,
    getStripeCustomerId,
    createCheckoutSession
}; 