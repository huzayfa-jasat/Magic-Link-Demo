// Dependencies
const express = require('express');
const verifyRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    verifyEmails,
    getStatus,
    getResults,
    getQueueStats,
    retryFailed
} = require('./controller.js');

// ------------
// Verify Routes
// ------------

// Apply authentication middleware to all routes
verifyRouter.use(checkUserAuth);

// Email verification routes
verifyRouter.post('/emails', verifyEmails);
verifyRouter.get('/status/:requestId', getStatus);
verifyRouter.get('/results/:requestId', getResults);
verifyRouter.get('/queue-stats', getQueueStats);
verifyRouter.post('/retry-failed', retryFailed);

// Export routes
module.exports = verifyRouter; 