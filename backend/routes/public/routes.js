// Dependencies
const express = require('express');
const publicRouter = express.Router();

// Middleware
const { checkApiKey, validateEmailLimit, mapIdToBatchId } = require('./middleware.js');
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

//List Creation Routes
publicRouter.post('/:checkType/new', checkValidCheckType, createNewBatch);
publicRouter.post('/:id/:checkType/add', checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, validateEmailLimit, addToBatch);
publicRouter.post('/:id/:checkType/start', checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, startBatchProcessing);

//List Status Routes
publicRouter.get('/:id/:checkType/status', checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchProgress);
publicRouter.get('/:id/:checkType/stats', checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchDetails);
publicRouter.get('/:id/:checkType/results', checkValidCheckType, mapIdToBatchId, checkUserBatchAccess, getBatchResults);

// Deliverability/Verify routes
publicRouter.post('/verify/bulk', validateEmails);
publicRouter.get('/verify/list/:batchId/status', getDeliverableBatchStatus);
publicRouter.get('/verify/list/:batchId/results', downloadDeliverableBatchResults);

// Catchall routes
publicRouter.post('/catchall/bulk', validateCatchall);
publicRouter.get('/catchall/list/:batchId/status', getCatchallBatchStatus);
publicRouter.get('/catchall/list/:batchId/results', downloadCatchallBatchResults);

// Export
module.exports = publicRouter; 