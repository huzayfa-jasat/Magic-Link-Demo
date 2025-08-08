const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { checkUserAuth } = require('../auth/funs_perms.js');

// Get available subscription plans
router.get('/list', checkUserAuth, controller.listPlans);

// Create subscription checkout session
router.post('/checkout', checkUserAuth, controller.createCheckout);

// Get subscription status for current user
router.get('/status', checkUserAuth, controller.getStatus);

// Create billing portal session for subscription management
router.post('/manage', checkUserAuth, controller.createPortalSession);

module.exports = router;