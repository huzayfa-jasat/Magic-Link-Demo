// Dependencies
const express = require('express');
const subscriptionsRouter = express.Router();

// Middleware Imports
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    listPlans,
    createCheckout,
    getStatus,
    createPortalSession,
} = require('./controller');

// Middleware
subscriptionsRouter.use(checkUserAuth);

// Routes
subscriptionsRouter.get('/list', listPlans);
subscriptionsRouter.post('/checkout', createCheckout);
subscriptionsRouter.get('/status', getStatus);
subscriptionsRouter.post('/manage', createPortalSession);

// Export
module.exports = subscriptionsRouter;