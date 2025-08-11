// Dependencies
const express = require('express');
const publicRouter = express.Router();

// Middleware
const { checkApiKey, bridgeToUser, validateEmailLimit, mapIdToBatchId } = require('./middleware.js');
const { checkValidCheckType, checkUserBatchAccess } = require('../batches/middleware.js');

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

const {
    createNewBatch,
    addToBatch,
    startBatchProcessing,
    getBatchProgress,
    getBatchDetails,
    getBatchResults
} = require('../batches/controller.js');

// ------------------
// Public API Routes
// ------------------

// Apply API key middleware to all routes
publicRouter.use(checkApiKey);

// General routes
publicRouter.get('/credits', getCredits);

//Batch Creation Routes
publicRouter.post('/:checkType/draft', bridgeToUser, checkValidCheckType, createNewBatch);
publicRouter.post('/:id/:checkType/add', bridgeToUser, checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, validateEmailLimit, addToBatch);
publicRouter.post('/:id/:checkType/start', bridgeToUser, checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, startBatchProcessing);

//Batch Status Routes
publicRouter.get('/:id/:checkType/status', bridgeToUser, checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchProgress);
publicRouter.get('/:id/:checkType/stats', bridgeToUser, checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchDetails);
publicRouter.get('/:id/:checkType/results', bridgeToUser, checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchResults);

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