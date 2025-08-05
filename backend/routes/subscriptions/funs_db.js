const knex = require('../../libs/knex');

// Get available subscription plans based on environment
async function db_getAvailablePlans(isProduction = false) {
  return await knex('Subscription_Plans')
    .where('is_active', 1)
    .where('is_live', isProduction ? 1 : 0)
    .orderBy('display_order', 'asc');
}

// Get user's current subscription
async function db_getUserSubscription(userId) {
  return await knex('User_Subscriptions')
    .where({ user_id: userId })
    .first();
}

// Get subscription with plan details
async function db_getUserSubscriptionWithPlan(userId) {
  return await knex('User_Subscriptions as us')
    .join('Subscription_Plans as sp', 'us.subscription_plan_id', 'sp.id')
    .where('us.user_id', userId)
    .select(
      'us.*',
      'sp.name as plan_name',
      'sp.display_price',
      'sp.regular_credits_per_period',
      'sp.catchall_credits_per_period',
      'sp.billing_period'
    )
    .first();
}

// Create or update user subscription
async function db_upsertUserSubscription(subscriptionData, trx) {
  const query = trx || knex;
  
  return await query('User_Subscriptions')
    .insert(subscriptionData)
    .onConflict('user_id')
    .merge([
      'subscription_plan_id',
      'stripe_subscription_id',
      'stripe_customer_id',
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

  const promises = [];

  // Allocate regular credits
  if (plan.regular_credits_per_period > 0) {
    promises.push(
      query('User_Deliverable_Sub_Credits')
        .insert({
          user_id: userId,
          credits_start: plan.regular_credits_per_period,
          credits_left: plan.regular_credits_per_period,
          expiry_ts: periodEnd
        })
        .onConflict('user_id')
        .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts'])
    );
  }

  // Allocate catchall credits
  if (plan.catchall_credits_per_period > 0) {
    promises.push(
      query('User_Catchall_Sub_Credits')
        .insert({
          user_id: userId,
          credits_start: plan.catchall_credits_per_period,
          credits_left: plan.catchall_credits_per_period,
          expiry_ts: periodEnd
        })
        .onConflict('user_id')
        .merge(['credits_start', 'credits_left', 'expiry_ts', 'updated_ts'])
    );
  }

  await Promise.all(promises);
  return true;
}

// Check if user has an active subscription
async function db_hasActiveSubscription(userId) {
  const subscription = await knex('User_Subscriptions')
    .where({ user_id: userId })
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
async function db_updateSubscriptionStatus(userId, status, cancelAtPeriodEnd = null, trx) {
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
    .where({ user_id: userId })
    .update(updateData);
}

module.exports = {
  db_getAvailablePlans,
  db_getUserSubscription,
  db_getUserSubscriptionWithPlan,
  db_upsertUserSubscription,
  db_getUserSubscriptionCredits,
  db_allocateSubscriptionCredits,
  db_hasActiveSubscription,
  db_getSubscriptionPlanById,
  db_getSubscriptionPlanByPriceId,
  db_updateSubscriptionStatus
};