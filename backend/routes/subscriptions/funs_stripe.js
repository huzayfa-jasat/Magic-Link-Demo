const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create a subscription checkout session
async function stripe_createSubscriptionCheckout(customerId, priceId, userId, subscriptionType, successUrl, cancelUrl) {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId.toString(),
      subscription_data: {
        metadata: {
          user_id: userId.toString(),
          subscription_type: subscriptionType
        }
      }
    });

    return session;
  } catch (error) {
    console.error('Error creating subscription checkout session:', error);
    throw error;
  }
}

// Create a subscription update/upgrade checkout session
async function stripe_createSubscriptionUpdateCheckout(subscriptionId, newPriceId, successUrl, cancelUrl) {
  try {
    // Get the subscription to find the current item
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = subscription.items.data[0];

    // Update the subscription immediately
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: currentItem.id,
        price: newPriceId,
      }],
      proration_behavior: 'create_prorations'
    });

    // Return a success response that redirects to success URL
    return { url: successUrl };
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

// Create a billing portal session
async function stripe_createPortalSession(customerId, returnUrl) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
}

// Get subscription details from Stripe
async function stripe_getSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'plan.product']
    });
    return subscription;
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw error;
  }
}

// Cancel subscription at period end
async function stripe_cancelSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

// Reactivate a canceled subscription
async function stripe_reactivateSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
    return subscription;
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw error;
  }
}

// Create or get Stripe customer
async function stripe_ensureCustomer(userId, email, stripeId = null) {
  try {
    // If stripe ID is provided and exists, return it
    if (stripeId) {
      return stripeId;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        user_id: userId.toString()
      }
    });

    // Update user record with Stripe customer ID (done in controller)
    return customer.id;
  } catch (error) {
    console.error('Error ensuring Stripe customer:', error);
    throw error;
  }
}

// Update user's Stripe customer ID in database
async function stripe_updateUserStripeId(userId, stripeCustomerId) {
  const knex = require('../../libs/knex');
  await knex('Users')
    .where({ id: userId })
    .update({ stripe_id: stripeCustomerId });
}

// Verify webhook signature
function stripe_verifyWebhookSignature(payload, signature, secret) {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
}

module.exports = {
  stripe_createSubscriptionCheckout,
  stripe_createSubscriptionUpdateCheckout,
  stripe_createPortalSession,
  stripe_getSubscription,
  stripe_cancelSubscription,
  stripe_reactivateSubscription,
  stripe_ensureCustomer,
  stripe_updateUserStripeId,
  stripe_verifyWebhookSignature
};