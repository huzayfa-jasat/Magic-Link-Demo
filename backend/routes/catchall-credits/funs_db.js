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
	const db_resp = await knex('Users_Catchall_Credit_Balance_History as h')
		.select(
			'h.credits_used', 
			'h.usage_ts',
			'h.event_typ',
			'h.batch_id',
			'h.batch_type',
			knex.raw(`
				CASE 
					WHEN h.batch_type = 'deliverable' THEN bd.title
					WHEN h.batch_type = 'catchall' THEN bc.title
					ELSE NULL
				END as batch_name
			`)
		)
		.leftJoin('Batches_Deliverable as bd', function() {
			this.on('h.batch_id', '=', 'bd.id')
				.andOn('h.batch_type', '=', knex.raw('?', ['deliverable']));
		})
		.leftJoin('Batches_Catchall as bc', function() {
			this.on('h.batch_id', '=', 'bc.id')
				.andOn('h.batch_type', '=', knex.raw('?', ['catchall']));
		})
		.where('h.user_id', user_id)
		.where('h.credits_used', '>', 0) // Filter out zero credit usage
		.orderBy('h.usage_ts', 'desc')
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