import axios from 'axios';

// Get available subscription plans
export const getSubscriptionPlans = async () => {
  try {
    const response = await axios.get('/api/subscriptions/list');
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Create subscription checkout session
export const createSubscriptionCheckout = async (planId) => {
  try {
    const response = await axios.post('/api/subscriptions/checkout', { plan_id: planId });
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Get subscription status
export const getSubscriptionStatus = async () => {
  try {
    const response = await axios.get('/api/subscriptions/status');
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Create billing portal session
export const createPortalSession = async () => {
  try {
    const response = await axios.post('/api/subscriptions/manage');
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};