// Dependencies
const express = require('express');
const publicRouter = express.Router();

// Middleware
const { checkApiKey } = require('./middleware.js');

// Controller Imports
const {
    getCredits,
    validateEmails,
    validateCatchall,
    getDeliverableBatchStatus,
    getCatchallBatchStatus,
    downloadDeliverableBatchResults,
    downloadCatchallBatchResults
} = require('./controller.js');

// ------------------
// Public API Routes
// ------------------

// Apply API key middleware to all routes
publicRouter.use(checkApiKey);

// General routes
publicRouter.get('/credits', getCredits);

// Deliverability/Verify routes
publicRouter.post('/verify/bulk', validateEmails);
publicRouter.get('/verify/batch/:batchId/status', getDeliverableBatchStatus);
publicRouter.get('/verify/batch/:batchId/results', downloadDeliverableBatchResults);

// Catchall routes
publicRouter.post('/catchall/bulk', validateCatchall);
publicRouter.get('/catchall/batch/:batchId/status', getCatchallBatchStatus);
publicRouter.get('/catchall/batch/:batchId/results', downloadCatchallBatchResults);

// Export
module.exports = publicRouter; 