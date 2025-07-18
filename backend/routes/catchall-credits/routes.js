// Dependencies
const express = require('express');
const catchallCreditsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getCatchallCreditBalance,
    getCatchallCreditBalanceHistory,
    useCatchallCredits,
} = require('./controller.js');

// Routes
catchallCreditsRouter.use(checkUserAuth);
catchallCreditsRouter.post('/use', useCatchallCredits);
catchallCreditsRouter.get('/credit-balance', getCatchallCreditBalance);
catchallCreditsRouter.get('/credit-balance/history', getCatchallCreditBalanceHistory);

// Export
module.exports = catchallCreditsRouter; 