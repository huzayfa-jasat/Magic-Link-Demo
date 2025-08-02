// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_getCreditsBalance,
	db_getCreditBalance,
	db_getCreditBalanceHistory,
	db_getReferralInviteCode,
	db_getReferralInviteList,
	db_redeemInviteCode,
	db_getLifetimeStats,
} = require("./funs_db.js");


/**
 * Get balance
 */
async function getBalance(req, res) {
	try {
		const [ok, resp] = await db_getCreditsBalance(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'credit_balance': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get balance");
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

/**
 * Get referral invite code
 */
async function getReferralInviteCode(req, res) {
	try {
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
		const [ok, resp] = await db_getReferralInviteList(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get referral invite list");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Redeem referral invite code
 */
async function redeemInviteCode(req, res) {
	try {
		// Validate request body
		const { code } = req.body;
		if (!code) return res.status(HttpStatus.BAD_REQUEST_STATUS).send("Code is required");

		// Redeem referral invite code
		const ok = await db_redeemInviteCode(req.user.id, code);
		if (ok) return res.sendStatus(HttpStatus.SUCCESS_STATUS);
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to redeem referral invite code");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get lifetime stats
 */
async function getLifetimeStats(req, res) {
	try {
		const [ok, resp] = await db_getLifetimeStats(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json(resp);
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get lifetime stats");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}


// Export
module.exports = {
	getBalance,
	getCreditBalance,
	getCreditBalanceHistory,
    getReferralInviteCode,
    getReferralInviteList,
	redeemInviteCode,
	getLifetimeStats,
};