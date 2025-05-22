// Dependencies
const express = require('express');
const creditsRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    getBalance,
    purchaseCredits,
    getReferralInviteCode,
    getReferralInviteList,
} = require('./controller.js');

// Routes
creditsRouter.use(checkUserAuth);
creditsRouter.get('/balance', getBalance);
creditsRouter.post('/purchase', purchaseCredits);
creditsRouter.get('/invite/code', getReferralInviteCode);
creditsRouter.get('/invites/list', getReferralInviteList);

// Export
module.exports = creditsRouter;