// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
	db_getBatchesList,
	db_addGlobalEmails,
	db_getEmailGlobalIds,
	db_getBatchDetails,
	db_getBatchResults,
	db_getBatchProgress,
	db_removeBatch,
	db_addToBatch,
	db_startBatchProcessing,
	db_pauseBatchProcessing,
	db_resumeBatchProcessing,
	db_checkCreditsOnly,
	db_deductCreditsForActualBatch,
	db_createBatchWithEstimate,
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
function returnBadRequest(res, msg, status=HttpStatus.BAD_REQUEST_STATUS) {
	return res.status(status).send(msg);
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

async function getBatchProgress(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Only supported for deliverable batches
		if (checkType !== 'deliverable') {
			return res.status(HttpStatus.SUCCESS_STATUS).json({
				progress: 100,
				processed: 0,
				total: 0,
				message: 'Progress tracking is only available for deliverable batches'
			});
		}

		// Get batch progress
		const [ok, progressData] = await db_getBatchProgress(req.user.id, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to get batch progress');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json(progressData);

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
		
		// If no batchId provided, this is a new batch creation - but this should now use /new endpoint
		const isNewBatch = !batchId;
		if (isNewBatch) {
			return returnBadRequest(res, 'Use /new endpoint to create new batches');
		}

		// Process emails
		const emails_valid = removeInvalidEmails(emails);
		const emails_stripped = emails_valid.reduce((acc, email)=>{
			const email_stripped = stripEmailModifiers(email);
			if (!acc[email_stripped]) acc[email_stripped] = email;
			return acc;
		}, {});

		// Add global emails
		const ok_global_insert = await db_addGlobalEmails(Object.keys(emails_stripped));
		if (!ok_global_insert) return returnBadRequest(res, 'Failed to process emails');

		// Get global emails
		const [ok_global_ids, global_emails] = await db_getEmailGlobalIds(emails_stripped);
		if (!ok_global_ids) return returnBadRequest(res, 'Failed to get global emails');

		// Add to existing batch
		const [add_ok, updated_batch_id] = await db_addToBatch(req.user.id, checkType, batchId, global_emails);
		if (!add_ok) return returnBadRequest(res, 'Failed to add emails to batch');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ id: updated_batch_id, count: Object.keys(emails_stripped).length });

	} catch (err) {
		console.error("ADD TO BATCH ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function startBatchProcessing(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Deduct credits based on actual batch size
		const [credits_ok, remaining_balance, actual_email_count] = await db_deductCreditsForActualBatch(req.user.id, checkType, batchId);
		if (!credits_ok) {
			return returnBadRequest(res, 'Insufficient credits for actual batch size', HttpStatus.PAYMENT_REQUIRED_STATUS);
		}

		// Check if low credits email should be sent (only for deliverable checks)
		if (checkType === 'deliverable' && remaining_balance < 1000 && req.user.email) {
			// Send low credits notification asynchronously - don't wait for it
			resend_sendLowCreditsEmail(req.user.email, remaining_balance).catch(err => {
				console.error('Failed to send low credits email:', err);
			});
		}

		// Start batch processing
		const ok = await db_startBatchProcessing(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to start batch processing');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ 
			message: 'Batch processing started',
			credits_deducted: actual_email_count,
			remaining_balance: remaining_balance
		});

	} catch (err) {
		console.error("START BATCH PROCESSING ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function pauseBatchProcessing(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Pause batch processing
		const ok = await db_pauseBatchProcessing(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to pause batch processing');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ message: 'Batch processing paused' });

	} catch (err) {
		console.error("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function resumeBatchProcessing(req, res) {
	try {
		const { checkType, batchId } = req.params;

		// Resume batch processing
		const ok = await db_resumeBatchProcessing(req.user.id, checkType, batchId);
		if (!ok) return returnBadRequest(res, 'Failed to resume batch processing');

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ message: 'Batch processing resumed' });

	} catch (err) {
		console.error("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function createNewBatch(req, res) {
	try {
		const { checkType } = req.params;
		const { emails, title } = req.body;

		// Validate body
		if (!emails || typeof emails !== 'number' || emails <= 0) {
			return returnBadRequest(res, 'Invalid emails count provided');
		}

		// Check credits (without deducting)
		const [ok_credits, current_balance] = await db_checkCreditsOnly(req.user.id, checkType, emails);
		if (!ok_credits) {
			return returnBadRequest(res, 'Insufficient credits', HttpStatus.PAYMENT_REQUIRED_STATUS);
		}

		// Create batch with estimated email count
		const [batch_ok, batch_id] = await db_createBatchWithEstimate(req.user.id, checkType, title, emails);
		if (!batch_ok) {
			return returnBadRequest(res, 'Failed to create batch');
		}

		// Return response
		return res.status(HttpStatus.SUCCESS_STATUS).json({ 
			id: batch_id, 
			estimated_emails: emails,
			current_balance: current_balance
		});

	} catch (err) {
		console.error("CREATE NEW BATCH ERR = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

// Exports
module.exports = {
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
}