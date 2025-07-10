// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const { encodeImage } = require('../../utils/convertEncodedImage.js');
const { generateUniqueApiKey } = require('../../utils/generateApiKey.js');


// -------------------
// CREATE Functions
// -------------------


// -------------------
// READ Functions
// -------------------
//Read profile name, email, profile picture, and API key
async function db_getProfileDetails(user_id) {
	let err_code;

	const db_resp = await knex('Users')
	.where('id',user_id)
	.select(
		'name AS name',
		'email AS email',
		'profile_image AS profileImage',
		'api_key AS apiKey',
	).limit(1).catch((err)=>{if (err) err_code = err.code});
	if (err_code || db_resp.length <= 0) return [false, null];
	return [true, db_resp[0]];
}

/**
 * Get API key for a user
 */
async function db_getApiKey(user_id) {
	let err_code;

	const db_resp = await knex('Users')
		.where('id', user_id)
		.select('api_key')
		.first()
		.catch((err)=>{if (err) err_code = err.code});
		
	if (err_code || !db_resp) return [false, null];
	return [true, db_resp.api_key];
}

// -------------------
// UPDATE Functions
// -------------------
async function db_updateProfileEmail(user_id, new_email) {
	let err_code;
	await knex('Users').where('id',user_id).update({
		'email': new_email,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}

async function db_updateProfileName(user_id, new_name) {
	let err_code;
	await knex('Users').where('id',user_id).update({
		'name': new_name,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}

async function db_updateProfilePicture(user_id, new_profile_picture) {
	let err_code;
	await knex('Users').where('id',user_id).update({
		'profile_image': encodeImage(new_profile_picture),
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}

/**
 * Generate a new API key for a user
 * @param {number} user_id - The user ID
 * @returns {Promise<boolean>} Success status
 */
async function db_generateApiKey(user_id) {
	let err_code;
	
	// Generate a unique API key
	const apiKey = await generateUniqueApiKey(knex);
	
	// Update the user's API key
	await knex('Users').where('id', user_id).update({
		'api_key': apiKey,
	}).catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) return false;
	return true;
}

/**
 * Get user by API key
 * @param {string} apiKey - The API key to look up
 * @returns {Promise<Array>} [success, user_data]
 */
async function db_getUserByApiKey(apiKey) {
	let err_code;
	
	const db_resp = await knex('Users')
		.where('api_key', apiKey)
		.select('id', 'name', 'email')
		.first()
		.catch((err)=>{if (err) err_code = err.code});
		
	if (err_code || !db_resp) return [false, null];
	return [true, db_resp];
}

// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_getProfileDetails,
	db_getApiKey,
	db_updateProfileEmail,
	db_updateProfileName,
	db_updateProfilePicture,
	db_generateApiKey,
	db_getUserByApiKey,
};