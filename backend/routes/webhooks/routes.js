// Dependencies
const express = require('express');
const webhooksRouter = express.Router();

// Controller Imports
const {
	handleStripeWebhook,
} = require('./controller');

// Routes
webhooksRouter.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Export
module.exports = webhooksRouter;