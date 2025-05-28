const express = require('express');
const router = express.Router();
const { createCheckout } = require('./controller');
const { checkUserAuth } = require('../auth/funs_perms');

// Create checkout session
router.post('/create-checkout', checkUserAuth, createCheckout);

module.exports = router; 