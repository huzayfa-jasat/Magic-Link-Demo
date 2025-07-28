// Dependencies
const express = require('express');
const creditsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getBalance,
    getCreditBalance,
    getCreditBalanceHistory,
    getReferralInviteCode,
    getReferralInviteList,
    redeemInviteCode,
} = require('./controller.js');

// Middleware
creditsRouter.use(checkUserAuth);

// Balance Routes
creditsRouter.get('/balance', getBalance);
creditsRouter.get('/credit-balance', getCreditBalance);
creditsRouter.get('/history', getCreditBalanceHistory);

// Referral Routes
creditsRouter.get('/invites/me', getReferralInviteCode);
creditsRouter.get('/invites/list', getReferralInviteList);
creditsRouter.post('/invites/redeem', redeemInviteCode);

// Export
module.exports = creditsRouter;