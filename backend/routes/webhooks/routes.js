// Dependencies
const express = require('express');
const webhooksRouter = express.Router();

// Controller Imports
const {
	handleStripeWebhook,
	handleResults
} = require('./controller');

// Middleware Imports
const {
	checkIncomingResultsAuth
} = require('../auth/funs_perms');

// Routes
webhooksRouter.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);
webhooksRouter.post('/results', checkIncomingResultsAuth, handleResults);

// Export
module.exports = webhooksRouter;