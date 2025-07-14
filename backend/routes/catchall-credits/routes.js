// Dependencies
const express = require('express');
const catchallCreditsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    purchaseCatchallCredits,
    getCatchallReferralInviteCode,
    getCatchallReferralInviteList,
    getCatchallCreditBalance,
    getCatchallCreditBalanceHistory,
    useCatchallCredits,
} = require('./controller.js');

// Routes
catchallCreditsRouter.use(checkUserAuth);
catchallCreditsRouter.post('/purchase', purchaseCatchallCredits);
catchallCreditsRouter.post('/use', useCatchallCredits);
catchallCreditsRouter.get('/invite/code', getCatchallReferralInviteCode);
catchallCreditsRouter.get('/invites/list', getCatchallReferralInviteList);
catchallCreditsRouter.get('/credit-balance', getCatchallCreditBalance);
catchallCreditsRouter.get('/credit-balance/history', getCatchallCreditBalanceHistory);

// Export
module.exports = catchallCreditsRouter; 