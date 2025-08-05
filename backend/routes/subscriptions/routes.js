const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { isAuthenticated } = require('../../middlewares/auth');

// Get available subscription plans
router.get('/list', isAuthenticated, controller.listPlans);

// Create subscription checkout session
router.post('/checkout', isAuthenticated, controller.createCheckout);

// Get subscription status for current user
router.get('/status', isAuthenticated, controller.getStatus);

// Create billing portal session for subscription management
router.post('/manage', isAuthenticated, controller.createPortalSession);

module.exports = router;