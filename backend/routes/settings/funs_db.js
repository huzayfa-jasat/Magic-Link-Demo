// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);


// -------------------
// CREATE Functions
// -------------------


// -------------------
// READ Functions
// -------------------
async function db_getProfileDetails(user_id) {
	let err_code;
	const db_resp = await knex('Users').where('id',user_id).select(
		'email AS email',
		'name AS name',
		'profile_image AS profileImage',
	).limit(1).catch((err)=>{if (err) err_code = err.code});
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

async function db_updateProfileLogo(user_id, new_profile_image) {
	let err_code;
	await knex('Users').where('id',user_id).update({
		'profile_image': new_profile_image,
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
	db_updateProfileLogo,
};