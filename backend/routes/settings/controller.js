// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_getProfileDetails,
	db_updateProfileEmail,
} = require("./funs_db.js");


/**
 * Get profile details
 */
async function getProfileDetails(req, res) {
	try {
		const [ok, resp] = await db_getProfileDetails(req.user.id);
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': resp});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to load profile details");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Update profile details
 */
async function updateProfileDetails(req, res) {
	try {
		let ok;
		switch (req.params.key) {
			case "email":
				ok = await db_updateProfileEmail(req.user.id, req.body.email);
				break;
			default:
				return res.sendStatus(HttpStatus.NOT_FOUND_STATUS);
		}
		if (ok) return res.sendStatus(HttpStatus.SUCCESS_STATUS);
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to update profile");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}


// Export
module.exports = {
	getProfileDetails,
	updateProfileDetails,
};