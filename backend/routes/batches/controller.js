// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
	db_getBatchesList,
	db_addGlobalEmails,
	db_createBatch,
	db_getEmailGlobalIds,
	db_getBatchDetails,
	db_getBatchResults,
	db_checkAndDeductCredits,
	db_removeBatch,
	db_addToBatch,
	db_startBatchProcessing,
	db_createBatchDraft
} = require('./funs_db.js');

// External API Function Imports
const {
	resend_sendLowCreditsEmail
} = require('../../external_apis/resend.js');

// Util Imports
const {
	removeInvalidEmails,
	stripEmailModifiers,
} = require('../../utils/processEmails.js');

// Constants
const MAX_EMAILS_PER_BATCH = 1000000; // Increased limit for progressive uploads
const VALID_BATCHLIST_ORDER_PARAMS = new Set([
	'timehl', // Time High-Low (newest first)
	'timelh', // Time Low-High (oldest first)
	'counthl', // Count High-Low (most emails first)
	'countlh' // Count Low-High (least emails first)
]);
const VALID_BATCHLIST_CATEGORY_PARAMS = new Set([
	'all', // All batches
	'deliverable', // Deliverable batches
	'catchall', // Catchall batches
]);
const VALID_BATCHLIST_STATUS_PARAMS = new Set([
	'all', // All batches
	'processing', // Processing batches
	'completed', // Completed batches
	'failed', // Failed batches
]);
const VALID_BATCHRESULTS_ORDER_PARAMS = new Set([
	'timehl', // Time High-Low (newest first)
	'timelh', // Time Low-High (oldest first)
	'scorehl', // Score High-Low (highest deliverability score first)
	'scorelh', // Score Low-High (lowest deliverability score first)
]);
const VALID_BATCHRESULTS_FILTER_PARAMS = new Set([
	'all', // All results
	'deliverable', // Deliverable results
	'undeliverable', // Undeliverable results
	'catchall', // Potential catchall results
]);

// Helper Functions
function returnBadRequest(res, msg) {
	return res.status(HttpStatus.BAD_REQUEST_STATUS).send(msg);
}

// ---------------------
// Controller Functions
// ---------------------

async function getBatchesList(req, res) {
	try {
		const { page=1, limit=10, order='timehl', category='all', status='all' } = req.query;

		// Validate query params
		if (page < 1) return returnBadRequest(res, 'Page must be at least 1');
		if (limit < 1) return returnBadRequest(res, 'Limit must be at least 1');
		if (!VALID_BATCHLIST_ORDER_PARAMS.has(order)) return returnBadRequest(res, 'Invalid order');
		if (!VALID_BATCHLIST_CATEGORY_PARAMS.has(category)) return returnBadRequest(res, 'Invalid category');
		if (!VALID_BATCHLIST_STATUS_PARAMS.has(status)) return returnBadRequest(res, 'Invalid status');

		// Get batches list
		const [ok, data, metadata] = await db_getBatchesList(req.user.id, page, limit, order, category, status);
		if (!ok) return returnBadRequest(res, 'Failed to get batches list');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({
			batches: data,
			metadata: metadata
		});

	} catch (err) {
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function getBatchDetails(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Get batch details
		const [ok, data] = await db_getBatchDetails(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to get batch details');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json(data);

	} catch (err) {
		console.error("GET BATCH DETAILS ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function getBatchResults(req, res) {
	try {
		const { checkType, batchId } = req.params;
		const { page=1, limit=10, order='timehl', filter='all', search='' } = req.query;

		// Validate query params
		if (page < 1) return returnBadRequest(res, 'Page must be at least 1');
		if (limit < 1) return returnBadRequest(res, 'Limit must be at least 1');
		if (!VALID_BATCHRESULTS_ORDER_PARAMS.has(order)) return returnBadRequest(res, 'Invalid order');
		if (!VALID_BATCHRESULTS_FILTER_PARAMS.has(filter)) return returnBadRequest(res, 'Invalid filter');

		// Get batch results
		const [ok, data, metadata] = await db_getBatchResults(req.user.id, checkType, batchId, page, limit, order, filter, search);
		if (!ok) return returnBadRequest(res, 'Failed to get batch results');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({
			results: data,
			metadata: metadata
		});

	} catch (err) {
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function removeBatch(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Remove batch
		const ok = await db_removeBatch(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to remove batch');

		// Return response
		return res.sendStatus(HttpStatus.SUCCESS_STATUS);

	} catch (err) {
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function addToBatch(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Validate body - for new batch creation, title is also required
		const { emails, title } = req.body;
		if (!emails || !Array.isArray(emails) || emails.length === 0) return returnBadRequest(res, 'No emails provided');
		
		// If no batchId provided, this is a new batch creation
		const isNewBatch = !batchId;

		// Process emails
		const emails_valid = removeInvalidEmails(emails);
		const emails_stripped = emails_valid.reduce((acc, email)=>{
			const email_stripped = stripEmailModifiers(email);
			if (!acc[email_stripped]) acc[email_stripped] = email;
			return acc;
		}, {});

		// Check & deduct credits
		const [ok_credits, remaining_balance] = await db_checkAndDeductCredits(req.user.id, checkType, Object.keys(emails_stripped).length);
		if (!ok_credits) return returnBadRequest(res, 'Insufficient credits');

		// Check if low credits email should be sent (only for deliverable checks)
		if (checkType === 'deliverable' && remaining_balance < 1000 && req.user.email) {
			// Send low credits notification asynchronously - don't wait for it
			sendLowCreditsEmail(req.user.email, remaining_balance).catch(err => {
				console.error('Failed to send low credits email:', err);
			});
		}

		// Add global emails
		const ok_global_insert = await db_addGlobalEmails(Object.keys(emails_stripped));
		if (!ok_global_insert) return returnBadRequest(res, 'Failed to process emails');

		// Get global emails
		const [ok_global_ids, global_emails] = await db_getEmailGlobalIds(emails_stripped);
		if (!ok_global_ids) return returnBadRequest(res, 'Failed to get global emails');

		// Handle new batch creation vs adding to existing batch
		let batch_ok, result_batch_id;
		
		if (isNewBatch) {
			// Create new draft batch
			const [create_ok, new_batch_id, fresh_email_ids] = await db_createBatchDraft(req.user.id, checkType, title, global_emails);
			batch_ok = create_ok;
			result_batch_id = new_batch_id;
		} else {
			// Add to existing batch
			const [add_ok, updated_batch_id] = await db_addToBatch(req.user.id, checkType, batchId, global_emails);
			batch_ok = add_ok;
			result_batch_id = updated_batch_id;
		}
		
		if (!batch_ok) return returnBadRequest(res, isNewBatch ? 'Failed to create batch' : 'Failed to add emails to batch');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ id: result_batch_id, count: Object.keys(emails_stripped).length });

	} catch (err) {
		console.error("ADD TO BATCH ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function startBatchProcessing(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Start batch processing
		const ok = await db_startBatchProcessing(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to start batch processing');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ message: 'Batch processing started' });

	} catch (err) {
		console.error("START BATCH PROCESSING ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

// Exports
module.exports = {
	getBatchesList,
	getBatchDetails,
	getBatchResults,
	removeBatch,
	addToBatch,
	startBatchProcessing
}