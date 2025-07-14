// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);


// -------------------
// CREATE Functions
// -------------------


// -------------------
// READ Functions
// -------------------
async function db_getCreditsBalance(user_id) {
	let err_code;
	const db_resp = await knex('Users_Credits')
		.select('credit_balance')
		.where('user_id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.credit_balance || 0];
}

async function db_getReferralInviteCode(user_id) {
	let err_code;
	const db_resp = await knex('Users')
		.select('referral_code')
		.where('id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.referral_code];
}

async function db_getReferralInviteList(user_id) {
	let err_code;
	const db_resp = await knex('Referrals as r')
		.select(
			knex.raw('COUNT(DISTINCT r.referred_id) as num_referrals'),
			knex.raw('SUM(r.credits_reward) as total_referral_credits'),
			'u.id as referred_user_id',
			'u.email as referred_user_email',
			'u.created_ts as referred_user_joined_ts',
			'uc.credit_balance as referred_user_credits'
		)
		.leftJoin('Users as u', 'r.referred_id', 'u.id')
		.leftJoin('Users_Credits as uc', 'r.referred_id', 'uc.user_id')
		.where('r.referrer_id', user_id)
		.groupBy('r.referred_id', 'u.id', 'u.email', 'u.created_ts', 'uc.credit_balance')
		.catch((err)=>{if (err) err_code = err.code});

	if (err_code) return [false, null];

	// Transform the data into the requested format
	const result = {
		num_referrals: db_resp.length,
		total_referral_credits: db_resp.reduce((sum, row) => sum + row.credits_reward, 0),
		referred_users: db_resp.map(row => ({
			user_id: row.referred_user_id,
			email: row.referred_user_email,
			joined_ts: row.referred_user_joined_ts,
			credits: row.referred_user_credits
		}))
	};

	return [true, result];
}

async function db_getCreditBalance(user_id) {
	let err_code;
	const db_resp = await knex('Users_Credit_Balance')
		.select('current_balance')
		.where('user_id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.current_balance || 0];
}

async function db_getCreditBalanceHistory(user_id) {
	let err_code;
	const db_resp = await knex('Users_Credit_Balance_History')
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

/**
 * Purchase regular credits
 */
async function db_purchaseCredits(userId, credits, packageCode, sessionId) {
	let err;
	await knex('Stripe_Purchases').insert({
		user_id: userId,
		session_id: sessionId,
		credits: credits,
		status: 'pending',
		created_at: new Date()
	}).catch((error) => { err = error; });
	if (err) return [false, null];
	return [true, {
		message: 'Purchase initiated',
		packageCode: packageCode,
		credits: credits,
		status: 'pending'
	}];
}


// ----- Export -----
module.exports = {
	db_getCreditsBalance,
	db_purchaseCredits,
	db_getReferralInviteCode,
	db_getReferralInviteList,
	db_getCreditBalance,
	db_getCreditBalanceHistory,
};