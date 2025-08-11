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
	createNewBatch,
	checkDuplicateFilename,
	generateS3UploadUrl,
	completeS3Upload,
	getExportUrls,
	getEnrichmentProgress,
	verifyCatchalls
} = require('./controller.js');

// ---------------
// Batches Routes
// ---------------

// Apply authentication middleware to all routes
batchesRouter.use(checkUserAuth);

// Routes
batchesRouter.get('/list', getBatchesList);
batchesRouter.post('/check-duplicate', checkDuplicateFilename);
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

// S3 Upload/Export Routes
batchesRouter.post('/:checkType/batch/:batchId/upload-url', checkValidCheckType, checkUserBatchAccess, generateS3UploadUrl);
batchesRouter.post('/:checkType/batch/:batchId/file-key', checkValidCheckType, checkUserBatchAccess, completeS3Upload);
batchesRouter.get('/:checkType/batch/:batchId/exports', checkValidCheckType, checkUserBatchAccess, getExportUrls);
batchesRouter.get('/:checkType/batch/:batchId/export-progress', checkValidCheckType, checkUserBatchAccess, getEnrichmentProgress);

// Verify Catchalls Route (only for deliverable batches)
batchesRouter.post('/deliverable/batch/:batchId/verify-catchalls', checkUserBatchAccess, verifyCatchalls);

// Export routes
module.exports = batchesRouter; 