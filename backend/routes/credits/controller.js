// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_getCreditsBalance,
	db_purchaseCredits,
	db_getReferralInviteCode,
	db_getReferralInviteList,
	db_getCreditBalance,
	db_getCreditBalanceHistory,
} = require("./funs_db.js");


/**
 * Get balance
 */
async function getBalance(req, res) {
	try {
		const [ok, resp] = await db_getCreditsBalance(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get balance");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Purchase credits
 */
async function purchaseCredits(req, res) {
	try {
		const { packageCode } = req.body;

		// Validate package code
		if (!VALID_PACKAGES.includes(packageCode)) {
			return res.status(HttpStatus.FAILED_STATUS).json({
				error: 'Invalid package code',
				validPackages: VALID_PACKAGES
			});
		}

		const userId = req.user.id;

		// Get or create Stripe customer ID
		let stripeCustomerId = await getStripeCustomerId(userId);
		if (!stripeCustomerId) {
			stripeCustomerId = await createStripeCustomer(userId, req.user.email);
		}

		// Create checkout session
		const { url: checkoutUrl, sessionId } = await createCheckoutSession(stripeCustomerId, packageCode);

		// Record the purchase attempt in the database
		const [ok, resp] = await db_purchaseCredits(userId, 0, packageCode, sessionId);
		if (ok) {
			return res.status(HttpStatus.SUCCESS_STATUS).json({
				url: checkoutUrl,
				data: resp
			});
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to process purchase");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get referral invite code
 */
async function getReferralInviteCode(req, res) {
	try {
		// TODO: Implement get referral invite code
		const [ok, resp] = await db_getReferralInviteCode(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get referral invite code");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get referral invite list
 */
async function getReferralInviteList(req, res) {
	try {
		// TODO: Implement get referral invite list
		const [ok, resp] = await db_getReferralInviteList(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get referral invite list");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get current credit balance (new table)
 */
async function getCreditBalance(req, res) {
	try {
		const [ok, resp] = await db_getCreditBalance(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get credit balance");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get credit balance history (new table)
 */
async function getCreditBalanceHistory(req, res) {
	try {
		const [ok, resp] = await db_getCreditBalanceHistory(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get credit balance history");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}


// Export
module.exports = {
	getBalance,
    purchaseCredits,
    getReferralInviteCode,
    getReferralInviteList,
	getCreditBalance,
	getCreditBalanceHistory,
};