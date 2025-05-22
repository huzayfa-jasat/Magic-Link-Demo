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


// -------------------
// DELETE Functions
// -------------------



// ----- Export -----
module.exports = {
	db_getProfileDetails,
	db_updateProfileEmail,
};