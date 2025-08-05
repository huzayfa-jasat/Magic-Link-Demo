const { validateCheckout, checkValidation } = require('./validators');
const {
  db_getAvailablePlans,
  db_getUserSubscription,
  db_getUserSubscriptionWithPlan,
  db_getUserSubscriptionCredits,
  db_hasActiveSubscription,
  db_getSubscriptionPlanById
} = require('./funs_db');
const {
  stripe_createSubscriptionCheckout,
  stripe_createPortalSession,
  stripe_ensureCustomer
} = require('./funs_stripe');

// GET /api/subscriptions/list
async function listPlans(req, res) {
  try {
    const userId = req.session.user_id;
    const isProduction = process.env.NODE_ENV === 'production';

    // Get available plans
    const plans = await db_getAvailablePlans(isProduction);

    // Get user's current subscription if any
    const userSubscription = await db_getUserSubscription(userId);

    return res.status(200).json({
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        display_price: plan.display_price,
        regular_credits_per_period: plan.regular_credits_per_period,
        catchall_credits_per_period: plan.catchall_credits_per_period,
        billing_period: plan.billing_period,
        features: plan.features
      })),
      current_subscription: userSubscription ? {
        plan_id: userSubscription.subscription_plan_id,
        status: userSubscription.status,
        cancel_at_period_end: userSubscription.cancel_at_period_end
      } : null
    });
  } catch (error) {
    console.error('Error listing subscription plans:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
}

// POST /api/subscriptions/checkout
async function createCheckout(req, res) {
  try {
    await checkValidation(req, res, () => {});
    if (res.headersSent) return;

    const userId = req.session.user_id;
    const { plan_id } = req.body;

    // Check if user already has an active subscription
    const hasSubscription = await db_hasActiveSubscription(userId);
    if (hasSubscription) {
      return res.status(400).json({ 
        error: 'You already have an active subscription. Please manage it from your subscription settings.' 
      });
    }

    // Get plan details
    const plan = await db_getSubscriptionPlanById(plan_id);
    if (!plan || !plan.is_active) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    // Check if plan is available in current environment
    const isProduction = process.env.NODE_ENV === 'production';
    if (plan.is_live !== (isProduction ? 1 : 0)) {
      return res.status(400).json({ error: 'This plan is not available in the current environment' });
    }

    // Get or create Stripe customer
    const knex = require('../../libs/knex');
    const user = await knex('Users').where({ id: userId }).first();
    const stripeCustomerId = await stripe_ensureCustomer(userId, user.email);

    // Create checkout session
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/packages?subscription=success`;
    const cancelUrl = `${baseUrl}/packages`;

    const session = await stripe_createSubscriptionCheckout(
      stripeCustomerId,
      plan.stripe_price_id,
      userId,
      successUrl,
      cancelUrl
    );

    return res.status(200).json({ checkout_url: session.url });
  } catch (error) {
    console.error('Error creating subscription checkout:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

// GET /api/subscriptions/status
async function getStatus(req, res) {
  try {
    const userId = req.session.user_id;

    // Get subscription with plan details
    const subscription = await db_getUserSubscriptionWithPlan(userId);
    
    if (!subscription) {
      return res.status(200).json({
        has_subscription: false,
        subscription: null
      });
    }

    // Get subscription credits
    const credits = await db_getUserSubscriptionCredits(userId);

    return res.status(200).json({
      has_subscription: true,
      subscription: {
        plan_name: subscription.plan_name,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        credits: {
          regular: credits.regular ? {
            start: credits.regular.credits_start,
            remaining: credits.regular.credits_left,
            expires_at: credits.regular.expiry_ts
          } : null,
          catchall: credits.catchall ? {
            start: credits.catchall.credits_start,
            remaining: credits.catchall.credits_left,
            expires_at: credits.catchall.expiry_ts
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
}

// POST /api/subscriptions/manage
async function createPortalSession(req, res) {
  try {
    const userId = req.session.user_id;

    // Get user's Stripe customer ID
    const knex = require('../../libs/knex');
    const user = await knex('Users')
      .where({ id: userId })
      .select('stripe_id')
      .first();

    if (!user?.stripe_id) {
      return res.status(400).json({ 
        error: 'No subscription found. Please subscribe to a plan first.' 
      });
    }

    // Check if user has a subscription
    const subscription = await db_getUserSubscription(userId);
    if (!subscription) {
      return res.status(400).json({ 
        error: 'No subscription found. Please subscribe to a plan first.' 
      });
    }

    // Create portal session
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/packages`;

    const session = await stripe_createPortalSession(user.stripe_id, returnUrl);

    return res.status(200).json({ portal_url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}

module.exports = {
  listPlans,
  createCheckout: [validateCheckout, createCheckout],
  getStatus,
  createPortalSession
};