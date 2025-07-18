// Dependencies
const express = require('express');
const creditsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getBalance,
    getReferralInviteCode,
    getReferralInviteList,
    getCreditBalance,
    getCreditBalanceHistory,
} = require('./controller.js');

// Routes
creditsRouter.use(checkUserAuth);
creditsRouter.get('/balance', getBalance);
creditsRouter.get('/invite/code', getReferralInviteCode);
creditsRouter.get('/invites/list', getReferralInviteList);
creditsRouter.get('/credit-balance', getCreditBalance);
creditsRouter.get('/history', getCreditBalanceHistory);

// Export
module.exports = creditsRouter;