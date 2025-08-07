const knex = require('knex')(require('../../knexfile.js').development);

// Get user by ID
async function db_getUserById(userId) {
  return await knex('Users')
    .where({ id: userId })
    .first();
}

// Get user's Stripe customer ID
async function db_getUserStripeId(userId) {
  const user = await knex('Users')
    .where({ id: userId })
    .select('stripe_id')
    .first();
  return user?.stripe_id || null;
}

// Get available subscription plans based on environment and type
async function db_getAvailablePlans(subscriptionType, isProduction = false) {
  return await knex('Subscription_Plans')
    .where('subscription_type', subscriptionType)
    .where('is_active', 1)
    .where('is_live', isProduction ? 1 : 0)
    .orderBy('display_order', 'asc');
}

// Get user's subscriptions (both regular and catchall)
async function db_getUserSubscriptions(userId) {
  return await knex('User_Subscriptions')
    .where({ user_id: userId })
    .whereIn('status', ['active', 'trialing'])
    .select('*');
}

// Get user's subscription by type
async function db_getUserSubscription(userId, subscriptionType) {
  return await knex('User_Subscriptions')
    .where('user_id', userId)
    .where('subscription_type', subscriptionType)
    .first();
}

// Get user's subscriptions with plan details
async function db_getUserSubscriptionsWithPlans(userId) {
  return await knex('User_Subscriptions as us')
    .join('Subscription_Plans as sp', 'us.subscription_plan_id', 'sp.id')
    .where('us.user_id', userId)
    .select(
      'us.*',
      'sp.name as plan_name',
      'sp.display_price',
      'sp.credits_per_period',
      'sp.billing_period'
    );
}

// Create or update user subscription
async function db_upsertUserSubscription(subscriptionData, trx) {
  const query = trx || knex;
  
  return await query('User_Subscriptions')
    .insert(subscriptionData)
    .onConflict(['user_id', 'subscription_type'])
    .merge([
      'subscription_plan_id',
      'stripe_subscription_id',
      'status',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'updated_ts'
    ]);
}

// Get user's subscription credits
async function db_getUserSubscriptionCredits(userId) {
  const [regularCredits, catchallCredits] = await Promise.all([
    knex('User_Deliverable_Sub_Credits')
      .where({ user_id: userId })
      .where('expiry_ts', '>', knex.fn.now())
      .first(),
    knex('User_Catchall_Sub_Credits')
      .where({ user_id: userId })
      .where('expiry_ts', '>', knex.fn.now())
      .first()
  ]);

  return {
    regular: regularCredits || null,
    catchall: catchallCredits || null
  };
}

// Allocate subscription credits (called from webhook)
async function db_allocateSubscriptionCredits(userId, planId, periodEnd, trx) {
  const query = trx || knex;
  
  // Get plan details
  const plan = await query('Subscription_Plans')
    .where({ id: planId })
    .first();
  
  if (!plan) {
    throw new Error('Subscription plan not found');
  }

  // Allocate credits based on subscription type
  if (plan.subscription_type === 'regular') {
    await query('User_Deliverable_Sub_Credits')
      .insert({
        user_id: userId,
        credits_start: plan.credits_per_period,
        credits_left: plan.credits_per_period,
        expiry_ts: periodEnd
      })
      .onConflict('user_id')
      .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts']);
  } else if (plan.subscription_type === 'catchall') {
    await query('User_Catchall_Sub_Credits')
      .insert({
        user_id: userId,
        credits_start: plan.credits_per_period,
        credits_left: plan.credits_per_period,
        expiry_ts: periodEnd
      })
      .onConflict('user_id')
      .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts']);
  }

  return true;
}

// Check if user has an active subscription of a specific type
async function db_hasActiveSubscription(userId, subscriptionType) {
  const subscription = await knex('User_Subscriptions')
    .where({ user_id: userId, subscription_type: subscriptionType })
    .whereIn('status', ['active', 'trialing'])
    .first();
  
  return !!subscription;
}

// Get subscription plan by ID
async function db_getSubscriptionPlanById(planId) {
  return await knex('Subscription_Plans')
    .where({ id: planId })
    .first();
}

// Get subscription plan by Stripe price ID
async function db_getSubscriptionPlanByPriceId(stripePriceId) {
  return await knex('Subscription_Plans')
    .where({ stripe_price_id: stripePriceId })
    .first();
}

// Update subscription status
async function db_updateSubscriptionStatus(userId, subscriptionType, status, cancelAtPeriodEnd = null, trx) {
  const query = trx || knex;
  const updateData = {
    status,
    updated_ts: knex.fn.now()
  };

  if (cancelAtPeriodEnd !== null) {
    updateData.cancel_at_period_end = cancelAtPeriodEnd;
  }

  if (status === 'canceled') {
    updateData.canceled_at = knex.fn.now();
  }

  return await query('User_Subscriptions')
    .where({ user_id: userId, subscription_type: subscriptionType })
    .update(updateData);
}

module.exports = {
  db_getUserById,
  db_getUserStripeId,
  db_getAvailablePlans,
  db_getUserSubscriptions,
  db_getUserSubscription,
  db_getUserSubscriptionsWithPlans,
  db_upsertUserSubscription,
  db_getUserSubscriptionCredits,
  db_allocateSubscriptionCredits,
  db_hasActiveSubscription,
  db_getSubscriptionPlanById,
  db_getSubscriptionPlanByPriceId,
  db_updateSubscriptionStatus
};