// Dependencies
import { http } from "./http";

// Constants
const MODULE_PREFIX = "/subscriptions";

// Get available subscription plans by type
export const getSubscriptionPlans = async (type = 'regular') => {
  try {
    const response = await http.get(`${MODULE_PREFIX}/list`, {
      params: { type },
      withCredentials: true
    });
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Create subscription checkout session
export const createSubscriptionCheckout = async (planId) => {
  try {
    const response = await http.post(`${MODULE_PREFIX}/checkout`, { plan_id: planId }, {
      withCredentials: true,
    });
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Get subscription status
export const getSubscriptionStatus = async () => {
  try {
    const response = await http.get(`${MODULE_PREFIX}/status`, {
      withCredentials: true,
    });
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};

// Create billing portal session
export const createPortalSession = async (type = 'regular') => {
  try {
    const response = await http.post(`${MODULE_PREFIX}/manage`, { type }, {
      withCredentials: true,
    });
    return response;
  } catch (error) {
    return error.response || { status: 500, data: { error: 'Network error' } };
  }
};