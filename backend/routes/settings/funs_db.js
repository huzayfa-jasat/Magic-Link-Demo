// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const { encodeImage } = require('../../utils/convertEncodedImage.js');


// -------------------
// CREATE Functions
// -------------------


// -------------------
// READ Functions
// -------------------
//Read profile name, email, and profile picture
async function db_getProfileDetails(user_id) {
	let err_code;

	const db_resp = await knex('Users')
	.where('id',user_id)
	.select(
		'name AS name',
		'email AS email',
		'profile_picture AS profile_picture',
	)
	.limit(1)
	.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code || db_resp.length <= 0) return [false, null];
	return [true, db_resp[0]];
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
	const encoded = encodeImage(new_profile_picture);
	if (!encoded) return false;
	await knex('Users').where('id',user_id).update({
		'profile_picture': encoded,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}


// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_getProfileDetails,
	db_updateProfileEmail,
	db_updateProfileName,
	db_updateProfilePicture,
};