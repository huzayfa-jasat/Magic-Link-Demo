const express = require('express');
const router = express.Router();
const { handleWebhook, handleResults, testWebhook } = require('./controller');
const { checkIncomingResultsAuth } = require('../auth/funs_perms');


// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), handleWebhook);
// Results endpoint
router.post('/results', checkIncomingResultsAuth, handleResults);

module.exports = router; 