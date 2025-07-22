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
	createBatch,
    getBatchDetails,
    getBatchResults,
	removeBatch
} = require('./controller.js');

// ---------------
// Batches Routes
// ---------------

// Apply authentication middleware to all routes
batchesRouter.use(checkUserAuth);

// Routes
batchesRouter.get('/list', getBatchesList);
batchesRouter.post('/:checkType/new', checkValidCheckType, createBatch);
batchesRouter.get('/:checkType/:batchId/details', checkValidCheckType, checkUserBatchAccess, getBatchDetails);
batchesRouter.get('/:checkType/:batchId/results', checkValidCheckType, checkUserBatchAccess, getBatchResults);
batchesRouter.delete('/:checkType/:batchId/rm', checkValidCheckType, checkUserBatchAccess, removeBatch);

// Export routes
module.exports = batchesRouter; 