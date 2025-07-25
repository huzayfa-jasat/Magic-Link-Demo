// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// -------------------
// CREATE Functions
// -------------------

// -------------------
// READ Functions
// -------------------

async function db_getCatchallCreditBalance(user_id) {
	let err_code;
	const db_resp = await knex('Users_Catchall_Credit_Balance')
		.select('current_balance')
		.where('user_id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.current_balance || 0];
}

async function db_getCatchallCreditBalanceHistory(user_id) {
	let err_code;
	const db_resp = await knex('Users_Catchall_Credit_Balance_History')
		.select('user_id', 'credits_used', 'usage_ts')
		.where('user_id', user_id)
		.orderBy('usage_ts', 'desc')
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp];
}

// -------------------
// UPDATE Functions
// -------------------

// -------------------
// DELETE Functions
// -------------------


// ----- Export -----
module.exports = {
	db_getCatchallCreditBalance,
	db_getCatchallCreditBalanceHistory,
}; 