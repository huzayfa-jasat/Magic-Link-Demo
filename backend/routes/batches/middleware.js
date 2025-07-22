// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_checkUserBatchAccess
} = require('./funs_db.js');

// Constants
const VALID_CHECK_TYPES = new Set(['deliverable', 'catchall']);

// Functions
function checkValidCheckType(req, res, next) {
	const { checkType } = req.params;
	if (!VALID_CHECK_TYPES.has(checkType)) return res.sendStatus(HttpStatus.NOT_FOUND_STATUS);
	next();
}
async function checkUserBatchAccess(req, res, next) {
	if (!req.params.batchId) return res.sendStatus(HttpStatus.NOT_FOUND_STATUS);
	const result = await db_checkUserBatchAccess(req.user.id, req.params.batchId, req.params.checkType);
	if (!result) return res.sendStatus(HttpStatus.NOT_FOUND_STATUS);
	next();
}

// Exports
module.exports = {
	checkValidCheckType,
	checkUserBatchAccess
}