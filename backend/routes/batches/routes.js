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
    getBatchProgress,
	removeBatch,
	addToBatch,
	startBatchProcessing,
	pauseBatchProcessing,
	resumeBatchProcessing,
	createNewBatch
} = require('./controller.js');

// ---------------
// Batches Routes
// ---------------

// Apply authentication middleware to all routes
batchesRouter.use(checkUserAuth);

// Routes
batchesRouter.get('/list', getBatchesList);
batchesRouter.post('/:checkType/new', checkValidCheckType, createNewBatch);
batchesRouter.post('/:checkType/add', checkValidCheckType, addToBatch);
batchesRouter.post('/:checkType/batch/:batchId/add', checkValidCheckType, checkUserBatchAccess, addToBatch);
batchesRouter.post('/:checkType/batch/:batchId/start', checkValidCheckType, checkUserBatchAccess, startBatchProcessing);
batchesRouter.patch('/:checkType/batch/:batchId/pause', checkValidCheckType, checkUserBatchAccess, pauseBatchProcessing);
batchesRouter.patch('/:checkType/batch/:batchId/resume', checkValidCheckType, checkUserBatchAccess, resumeBatchProcessing);
batchesRouter.get('/:checkType/batch/:batchId/details', checkValidCheckType, checkUserBatchAccess, getBatchDetails);
batchesRouter.get('/:checkType/batch/:batchId/results', checkValidCheckType, checkUserBatchAccess, getBatchResults);
batchesRouter.get('/:checkType/batch/:batchId/progress', checkValidCheckType, checkUserBatchAccess, getBatchProgress);
batchesRouter.delete('/:checkType/batch/:batchId/rm', checkValidCheckType, checkUserBatchAccess, removeBatch);

// Export routes
module.exports = batchesRouter; 