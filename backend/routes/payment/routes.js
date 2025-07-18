// Dependencies
const express = require('express');
const paymentRouter = express.Router();

// Middleware Imports
const { checkUserAuth } = require('../auth/funs_perms');

// Controller Imports
const {
	createCheckout,
	getPackages
} = require('./controller');

// Middleware Setup
paymentRouter.use(checkUserAuth);

// Routes
paymentRouter.post('/checkout', createCheckout);
paymentRouter.get('/packages/list', getPackages);

// Export router
module.exports = paymentRouter; 