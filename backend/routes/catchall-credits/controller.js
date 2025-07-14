// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	// db_getCatchallCreditsBalance, // Removed old system
	db_purchaseCatchallCredits,
	db_getCatchallReferralInviteCode,
	db_getCatchallReferralInviteList,
	db_getCatchallCreditBalance,
	db_getCatchallCreditBalanceHistory,
	db_useCatchallCredits,
} = require("./funs_db.js");

// Payment imports - use existing payment logic
const { createStripeCustomer, getStripeCustomerId, createCheckoutSession } = require('../payment/funs_db.js');

// Valid catchall package codes
const VALID_CATCHALL_PACKAGES = [
    'catchall_10k', 'catchall_25k', 'catchall_50k', 'catchall_100k', 
    'catchall_250k', 'catchall_500k', 'catchall_1m'
];


/**
 * Purchase catchall credits
 */
async function purchaseCatchallCredits(req, res) {
	try {
		const { packageCode } = req.body;

		// Validate package code
		if (!packageCode || !VALID_CATCHALL_PACKAGES.includes(packageCode)) {
			return res.status(HttpStatus.FAILED_STATUS).json({ 
				error: 'Invalid catchall package code',
				validPackages: VALID_CATCHALL_PACKAGES
			});
		}

		const userId = req.user.id;

		// Get or create Stripe customer ID
		let stripeCustomerId = await getStripeCustomerId(userId);
		if (!stripeCustomerId) {
			stripeCustomerId = await createStripeCustomer(userId, req.user.email);
		}

		// Use existing checkout session function
		const { url: checkoutUrl, sessionId } = await createCheckoutSession(stripeCustomerId, packageCode);

		// Call database function to record the purchase attempt
		const [ok, resp] = await db_purchaseCatchallCredits(userId, 0, packageCode, sessionId);
		if (ok) {
			return res.status(HttpStatus.SUCCESS_STATUS).json({ 
				url: checkoutUrl,
				data: resp 
			});
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to process catchall purchase");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get catchall referral invite code
 */
async function getCatchallReferralInviteCode(req, res) {
	try {
		// TODO: Implement get catchall referral invite code
		const [ok, resp] = await db_getCatchallReferralInviteCode(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get catchall referral invite code");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get catchall referral invite list
 */
async function getCatchallReferralInviteList(req, res) {
	try {
		// TODO: Implement get catchall referral invite list
		const [ok, resp] = await db_getCatchallReferralInviteList(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get catchall referral invite list");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get current catchall credit balance (new table)
 */
async function getCatchallCreditBalance(req, res) {
	try {
		const [ok, resp] = await db_getCatchallCreditBalance(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get catchall credit balance");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get catchall credit balance history (new table)
 */
async function getCatchallCreditBalanceHistory(req, res) {
	try {
		const [ok, resp] = await db_getCatchallCreditBalanceHistory(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get catchall credit balance history");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Use catchall credits for verification
 */
async function useCatchallCredits(req, res) {
	try {
		const { credits, requestId, description } = req.body;

		// Validate credits amount
		if (!credits || isNaN(credits) || credits <= 0) {
			return res.status(HttpStatus.BAD_REQUEST_STATUS).json({
				error: 'Invalid credits amount',
				code: 'INVALID_CREDITS'
			});
		}

		// Use catchall credits
		const [ok, resp] = await db_useCatchallCredits(req.user.id, credits, requestId);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to use catchall credits");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

// Export
module.exports = {
	purchaseCatchallCredits,
    getCatchallReferralInviteCode,
    getCatchallReferralInviteList,
	getCatchallCreditBalance,
	getCatchallCreditBalanceHistory,
	useCatchallCredits,
}; 