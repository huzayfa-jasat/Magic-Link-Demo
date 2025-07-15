// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_createVerifyRequest,
	db_listVerifyRequests,
	db_getVerifyRequestDetails,
	db_getPaginatedVerifyRequestResults,
	db_getPaginatedEmailResults,
	db_exportBatchResultsCsv,
} = require("./funs_db.js");

const { db_getCreditBalance } = require("../credits/funs_db.js");
const { sendLowCreditsEmail } = require('../../external_apis/resend');

const { Parser } = require('json2csv');

// Default constants
const DEFAULT_BATCH_RESULT_FILTER = 'all';
const DEFAULT_BATCH_RESULT_PAGE = 1;
const DEFAULT_BATCH_RESULT_PER_PAGE = 500;
const ALLOWED_FILTERS = ['all', 'valid', 'invalid', 'catch-all'];

/**
 * Check if user has low credits and send notification email
 * @param {number} userId - The user ID
 * @param {string} userEmail - The user's email address
 */
async function checkAndNotifyLowCredits(userId, userEmail) {
	try {
		const [ok, balance] = await db_getCreditBalance(userId);
		if (ok && balance < 1000) {
			await sendLowCreditsEmail(userEmail, balance).catch((err) => {
				console.error('Failed to send low credits email:', err);
			});
		}
	} catch (err) {
		console.error('Error checking low credits:', err);
	}
}

/**
 * Verify a single email
 */
async function verifySingleEmail(req, res) {
	try {
		// Validate request body
		const { email } = req.body;
		if (!email || typeof email !== 'string') return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Email is required");

		// Verify email
		const [ok, result] = await db_createVerifyRequest(req.user.id, [email]);
		if (ok) {
			// Check for low credits and send notification
			await checkAndNotifyLowCredits(req.user.id, req.user.email);
			return res.status(HttpStatus.SUCCESS_STATUS).json({'data': result});
		}
		
		// Handle specific error types
		if (result === 'insufficient_credits') {
			return res.status(429).send("Insufficient credits to process this request");
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to create verify request");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Verify a bulk of emails
 */
async function verifyBulkEmails(req, res) {
	try {
		// Validate request body
		const { emails } = req.body;
		if (!emails || !Array.isArray(emails) || emails.length <= 0) return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Emails are required");
		for (const email of emails) {
			if (typeof email !== 'string') return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Emails must be properly formatted strings");
		}

		// Verify email
		const [ok, result] = await db_createVerifyRequest(req.user.id, emails.map(email => email.replaceAll('\\\"','').trim()));
		if (ok) {
			// Check for low credits and send notification
			await checkAndNotifyLowCredits(req.user.id, req.user.email);
			return res.status(HttpStatus.SUCCESS_STATUS).json({'data': result});
		}
		
		// Handle specific error types
		if (result === 'insufficient_credits') {
			return res.status(429).send("Insufficient credits to process this request");
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to create verify request");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Verify an import of emails
 */
async function verifyImportEmails(req, res) {
  try {
    // Validate request body
    const { emails, request_id, file_name } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res
        .status(HttpStatus.BAD_REQUEST_STATUS)
        .send("Emails array is required");
    }

    // Verify emails
    const [ok, result] = await db_createVerifyRequest(
      req.user.id,
      emails,
      request_id,
      file_name || null
    );
    if (ok) {
      // Check for low credits and send notification
      await checkAndNotifyLowCredits(req.user.id, req.user.email);
      return res
        .status(HttpStatus.SUCCESS_STATUS)
        .json({ data: result });
    }
    
    // Handle specific error types
    if (result === 'insufficient_credits') {
      return res.status(429).send("Insufficient credits to process this request");
    }
    return res
      .status(HttpStatus.FAILED_STATUS)
      .send("Failed to create verify request");
  } catch (err) {
    console.log("MTE = ", err);
    return res
      .status(HttpStatus.MISC_ERROR_STATUS)
      .send(HttpStatus.MISC_ERROR_MSG);
  }
}

/**
 * List verify requests
 */
async function listVerifyRequests(req, res) {
	try {
		const [ok, resp] = await db_listVerifyRequests(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to list verify requests");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get verify request details
 */
async function getVerifyRequestDetails(req, res) {
	try {
		const [ok, resp] = await db_getVerifyRequestDetails(req.user.id, req.params.request_id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get verify request details");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get paginated verify request results
 */
async function getPaginatedVerifyRequestResults(req, res) {
  try {
    // Validate request params
    const request_id = req.params.request_id;
    const page = parseInt(req.query.page) || 1;
    const per_page = parseInt(req.query.per_page) || 50;
    const search = req.query.search || null;

    if (!request_id || typeof request_id !== "string")
      return res
        .status(HttpStatus.BAD_REQUEST_STATUS)
        .send("Request ID is required");
    if (!page || typeof page !== "number")
      return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Page is required");
    if (typeof per_page !== "number")
      return res
        .status(HttpStatus.BAD_REQUEST_STATUS)
        .send("Per page must be a number");

    // Get paginated verify request results
    const [ok, resp] = await db_getPaginatedVerifyRequestResults(
      req.user.id,
      request_id,
      page,
      per_page,
      search
    );
    if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({ data: resp });
    return res.status(HttpStatus.FAILED_STATUS).send("Err = " + resp);
  } catch (err) {
    console.log("MTE = ", err);
    return res
      .status(HttpStatus.MISC_ERROR_STATUS)
      .send(HttpStatus.MISC_ERROR_MSG);
  }
}

/**
 * Get paginated email results
 */
async function getPaginatedEmailResults(req, res) {
	try {
		// Validate request params
		const page = parseInt(req.params.page) || 1;
		const per_page = parseInt(req.params.per_page) || 50;
		
		if (!page || typeof page !== 'number') return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Page is required");
		if (typeof per_page !== 'number') return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Per page must be a number");

		// Get paginated email results
		const [ok, resp] = await db_getPaginatedEmailResults(req.user.id, page, per_page);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get paginated email results");
		
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

async function exportBatchResultsCsv(req, res) {
	try {
		const request_id = req.query.request_id;
		const filter = req.query.filter || DEFAULT_BATCH_RESULT_FILTER;
		const page = parseInt(req.query.page) || DEFAULT_BATCH_RESULT_PAGE;
		const per_page = parseInt(req.query.per_page) || DEFAULT_BATCH_RESULT_PER_PAGE;
		if (!request_id) return res.status(HttpStatus.BAD_REQUEST_STATUS).send('Missing request_id');

		// Validate filter
		if (!ALLOWED_FILTERS.includes(filter)) {
			return res.status(HttpStatus.BAD_REQUEST_STATUS).send('Invalid filter');
		}

		const [ok, results] = await db_exportBatchResultsCsv(req.user.id, request_id, filter, page, per_page);
		if (!ok) return res.status(HttpStatus.FAILED_STATUS).send('Failed to fetch results');

		const hasMore = results.length === per_page;
		return res.status(HttpStatus.SUCCESS_STATUS).json({ data: results, hasMore });
	} catch (err) {
		console.log('MTE = ', err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send('Error exporting results');
	}
}

// Export
module.exports = {
	verifySingleEmail,
	verifyBulkEmails,
	verifyImportEmails,
	listVerifyRequests,
	getVerifyRequestDetails,
	getPaginatedVerifyRequestResults,
	getPaginatedEmailResults,
	exportBatchResultsCsv,
};