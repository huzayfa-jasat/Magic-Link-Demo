const express = require('express');
const router = express.Router();
const { createCheckout } = require('./controller');
const { isAuthenticated } = require('../../utils/auth');

// Create checkout session
router.post('/create-checkout', isAuthenticated, createCheckout);

module.exports = router; 