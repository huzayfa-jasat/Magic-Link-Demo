// Dependencies
const express = require('express');
const batchesRouter = express.Router();

// Middleware Imports
const {
	checkUserAuth
} = require('../auth/funs_perms.js');
const {
	checkValidCheckType,
	checkUserBatchAccess
} = require('./middleware.js');

// Controller Imports
const {
	getBatchesList,
    getBatchDetails,
    getBatchResults,
	removeBatch,
	addToBatch,
	startBatchProcessing
} = require('./controller.js');

// ---------------
// Batches Routes
// ---------------

// Apply authentication middleware to all routes
batchesRouter.use(checkUserAuth);

// Routes
batchesRouter.get('/list', getBatchesList);
batchesRouter.post('/:checkType/add', checkValidCheckType, addToBatch); // For creating new batch
batchesRouter.post('/:checkType/batch/:batchId/add', checkValidCheckType, checkUserBatchAccess, addToBatch); // For adding to existing batch
batchesRouter.post('/:checkType/batch/:batchId/start', checkValidCheckType, checkUserBatchAccess, startBatchProcessing);
batchesRouter.get('/:checkType/batch/:batchId/details', checkValidCheckType, checkUserBatchAccess, getBatchDetails);
batchesRouter.get('/:checkType/batch/:batchId/results', checkValidCheckType, checkUserBatchAccess, getBatchResults);
batchesRouter.delete('/:checkType/batch/:batchId/rm', checkValidCheckType, checkUserBatchAccess, removeBatch);

// Export routes
module.exports = batchesRouter; 