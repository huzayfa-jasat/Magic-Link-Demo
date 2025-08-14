// Dependencies
const express = require('express');
const publicRouter = express.Router();

// Middleware
const { checkApiKey, validateEmailLimit } = require('./middleware.js');
const { checkValidCheckType, checkUserBatchAccess } = require('../batches/middleware.js');

// Controller Imports
const {
    getCredits
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

// Batch Management Routes
publicRouter.post('/:checkType/new', checkValidCheckType, createNewBatch);
publicRouter.post('/:batchId/:checkType/add', checkValidCheckType, checkUserBatchAccess, validateEmailLimit, addToBatch);
publicRouter.post('/:batchId/:checkType/start', checkValidCheckType, checkUserBatchAccess, startBatchProcessing);

// Batch Status Routes
publicRouter.get('/:batchId/:checkType/status', checkValidCheckType, checkUserBatchAccess, getBatchProgress);
publicRouter.get('/:batchId/:checkType/stats', checkValidCheckType, checkUserBatchAccess, getBatchDetails);
publicRouter.get('/:batchId/:checkType/results', checkValidCheckType, checkUserBatchAccess, getBatchResults);

// Export
module.exports = publicRouter; 