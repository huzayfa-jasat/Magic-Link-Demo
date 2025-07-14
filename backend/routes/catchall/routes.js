// Dependencies
const express = require('express');
const catchallRouter = express.Router();

// Middleware
const { checkUserAuth } = require('../auth/funs_perms.js');

// Controller Imports
const {
    verifyCatchallEmails,
    getCatchallStatus,
    getCatchallResults,
    getCatchallQueueStats,
    retryCatchallFailed
} = require('./controller.js');

// ------------
// Catchall Routes
// ------------

// Apply authentication middleware to all routes
catchallRouter.use(checkUserAuth);

// Catchall verification routes
catchallRouter.post('/emails', verifyCatchallEmails);
catchallRouter.get('/status/:requestId', getCatchallStatus);
catchallRouter.get('/results/:requestId', getCatchallResults);
catchallRouter.get('/queue-stats', getCatchallQueueStats);
catchallRouter.post('/retry-failed/:requestId', retryCatchallFailed);

// Export routes
module.exports = catchallRouter; 