const { validateCheckout, checkValidation } = require('./validators');
const {
  db_getUserById,
  db_getUserStripeId,
  db_getAvailablePlans,
  db_getUserSubscription,
  db_getUserSubscriptionsWithPlans,
  db_getUserSubscriptionCredits,
  db_hasActiveSubscription,
  db_getSubscriptionPlanById
} = require('./funs_db');
const {
  stripe_createSubscriptionCheckout,
  stripe_createSubscriptionUpdateCheckout,
  stripe_createPortalSession,
  stripe_ensureCustomer,
  stripe_updateUserStripeId
} = require('./funs_stripe');

// GET /api/subscriptions/list
async function listPlans(req, res) {
  try {
    const userId = req.session.user_id;
    const { type = 'regular' } = req.query; // Accept type as query param
    const isProduction = process.env.NODE_ENV === 'production';

    // Get available plans for the specified type
    const plans = await db_getAvailablePlans(type, isProduction);

    // Get user's subscription for this type
    const userSubscription = await db_getUserSubscription(userId, type);

    return res.status(200).json({
      subscription_type: type,
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        display_price: plan.display_price,
        credits_per_period: plan.credits_per_period,
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

    // Check if user already has an active subscription of this type
    const existingSubscription = await db_getUserSubscription(userId, plan.subscription_type);
    
    // Get user data
    const user = await db_getUserById(userId);
    let stripeCustomerId = user.stripe_id;
    
    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      stripeCustomerId = await stripe_ensureCustomer(userId, user.email);
      await stripe_updateUserStripeId(userId, stripeCustomerId);
    }

    // Create checkout session
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/packages?subscription=success&type=${plan.subscription_type}`;
    const cancelUrl = `${baseUrl}/packages?p=${plan.subscription_type === 'catchall' ? 'catchall' : 'subscriptions'}`;

    // If user has existing subscription, create upgrade/downgrade session
    const session = existingSubscription && existingSubscription.status === 'active' ?
      await stripe_createSubscriptionUpdateCheckout(
        existingSubscription.stripe_subscription_id,
        plan.stripe_price_id,
        successUrl,
        cancelUrl
      ) :
      await stripe_createSubscriptionCheckout(
        stripeCustomerId,
        plan.stripe_price_id,
        userId,
        plan.subscription_type,
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

    // Get all subscriptions with plan details
    const subscriptions = await db_getUserSubscriptionsWithPlans(userId);
    
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        has_subscription: false,
        subscriptions: {}
      });
    }

    // Get subscription credits
    const credits = await db_getUserSubscriptionCredits(userId);

    // Organize subscriptions by type
    const subscriptionsByType = {};
    subscriptions.forEach(sub => {
      subscriptionsByType[sub.subscription_type] = {
        plan_name: sub.plan_name,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        credits_per_period: sub.credits_per_period
      };
    });

    return res.status(200).json({
      has_subscription: true,
      subscriptions: subscriptionsByType,
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
    const { type = 'regular' } = req.body; // Accept subscription type

    // Get user's Stripe customer ID
    const stripeCustomerId = await db_getUserStripeId(userId);
    
    if (!stripeCustomerId) {
      return res.status(400).json({ 
        error: 'No subscription found. Please subscribe to a plan first.' 
      });
    }

    // Check if user has a subscription of this type
    const subscription = await db_getUserSubscription(userId, type);
    if (!subscription) {
      return res.status(400).json({ 
        error: `No ${type} subscription found. Please subscribe to a plan first.` 
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