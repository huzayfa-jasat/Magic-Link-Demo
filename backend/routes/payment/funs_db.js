const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const knex = require('knex')(require('../../knexfile.js').development);

/**
 * Create a Stripe customer for a user
 * @param {number} userId - The user's ID
 * @param {string} email - The user's email
 * @returns {Promise<string>} The Stripe customer ID
 */
async function createStripeCustomer(userId, email) {
    let err;
    try {
        const customer = await stripe.customers.create({
            email: email,
            metadata: {
                userId: userId
            }
        });

        // Update user with Stripe ID
        await knex('Users')
            .where('id', userId)
            .update({ stripe_id: customer.id })
            .catch((error) => { err = error; });

        if (err) throw err;
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
    createStripeCustomer,
    getStripeCustomerId,
    createCheckoutSession
}; 