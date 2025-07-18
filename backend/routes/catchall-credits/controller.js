// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_getCatchallCreditBalance,
	db_getCatchallCreditBalanceHistory,
	// db_useCatchallCredits,
} = require("./funs_db.js");

/**
 * Get current catchall credit balance
 */
async function getCatchallCreditBalance(req, res) {
	try {
		const [ok, resp] = await db_getCatchallCreditBalance(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'credit_balance': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to get catchall credit balance");
	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Get catchall credit balance history
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
 * Use catchall credits
 */
// async function useCatchallCredits(req, res) {
// 	try {
// 		const { credits } = req.body;
// 		if (!credits || credits <= 0) {
// 			return res.status(HttpStatus.FAILED_STATUS).json({
// 				error: 'Invalid credits amount'
// 			});
// 		}

// 		const [ok, resp] = await db_useCatchallCredits(req.user.id, credits);
// 		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
// 		return res.status(HttpStatus.FAILED_STATUS).send("Failed to use catchall credits");
// 	} catch (err) {
// 		console.log("MTE = ", err);
// 		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
// 	}
// }

// Export
module.exports = {
    getCatchallCreditBalance,
    getCatchallCreditBalanceHistory,
    // useCatchallCredits,
};