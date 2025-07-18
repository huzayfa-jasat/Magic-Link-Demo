// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const {
	db_getProfileDetails,
	db_getApiKey,
	db_updateProfileEmail,
	db_updateProfileName,
	db_updateProfilePicture,
	db_createApiKey,
	db_refreshApiKey,
	db_removeApiKey,
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
 * Get API key (masked)
 */
async function getApiKey(req, res) {
	try {
		const [ok, apiKey] = await db_getApiKey(req.user.id);
		
		if (ok) return res.status(HttpStatus.SUCCESS_STATUS).json({'data': { apiKey }});
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to load API key");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Create API key
 */
async function createApiKey(req, res) {
	try {
		const [ok, apiKey] = await db_createApiKey(req.user.id);
		if (ok && apiKey) {
			return res.status(HttpStatus.SUCCESS_STATUS).json({'data': apiKey});
		} else if (!ok) {
			return res.status(HttpStatus.FAILED_STATUS).send("API key already exists or failed to create");
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to create API key");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Regenerate API key
 */
async function refreshApiKey(req, res) {
	try {
		const [ok, apiKey] = await db_refreshApiKey(req.user.id);
		if (ok && apiKey) {
			return res.status(HttpStatus.SUCCESS_STATUS).json({'data': apiKey});
		}
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to regenerate API key");

	} catch (err) {
		console.log("MTE = ", err);
		return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
	}
}

/**
 * Delete API key
 */
async function removeApiKey(req, res) {
	try {
		const ok = await db_removeApiKey(req.user.id);
		if (ok) return res.sendStatus(HttpStatus.SUCCESS_STATUS);
		return res.status(HttpStatus.FAILED_STATUS).send("Failed to delete API key");

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
				ok = await db_updateProfileEmail(req.user.id, req.body.value);
				break;
			case "name":
				ok = await db_updateProfileName(req.user.id, req.body.value);
				break;
			case "pfp":
				ok = await db_updateProfilePicture(req.user.id, req.body.value);
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
	getApiKey,
	createApiKey,
	refreshApiKey,
	removeApiKey,
	updateProfileDetails,
};