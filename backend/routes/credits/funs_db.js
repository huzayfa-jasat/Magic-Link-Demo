// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Constants
const REFERRAL_CREDITS_REWARD = 5000;


// -------------------
// CREATE Functions
// -------------------
async function db_creditReferralUser(user_id, credits_reward) {
	let err_code;

	// Increment balance
	await knex('Users_Credit_Balance')
		.where('user_id', user_id)
		.increment('current_balance', credits_reward)
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Create history record
	await knex('Users_Credit_Balance_History').insert({
		user_id: user_id,
		credits_used: credits_reward,
		event_typ: 'refer_reward',
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Return success
	return true;
}


// -------------------
// READ Functions
// -------------------
async function db_getCreditsBalance(user_id) {
	let err_code;
	const db_resp = await knex('Users_Credit_Balance')
		.select('current_balance')
		.where('user_id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.current_balance || 0];
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
			'r.credits_reward as credits_reward'
		)
		.leftJoin('Users as u', 'r.referred_id', 'u.id')
		.where('r.referrer_id', user_id)
		.groupBy('r.referred_id', 'u.id', 'u.email', 'u.created_ts', 'r.credits_reward')
		.catch((err)=>{if (err) err_code = err.code});

	if (err_code) return [false, null];

	// Transform the data into the requested format
	const result = {
		num_referrals: db_resp.length,
		total_referral_credits: db_resp.reduce((sum, row) => sum + row.credits_reward, 0),
		referred_users: db_resp.map(row => ({
			id: row.referred_user_id,
			email: row.referred_user_email,
			joined_ts: row.referred_user_joined_ts,
			credits: row.credits_reward
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
		.select('credits_used', 'usage_ts', 'event_typ')
		.where('user_id', user_id)
		.orderBy('usage_ts', 'desc')
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp];
}


// -------------------
// UPDATE Functions
// -------------------
async function db_redeemInviteCode(user_id, code) {
	let err_code;

	// Get refererr user
	const referrer_user = await knex('Users')
		.where('referral_code', code)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Don't leak referral code existence
	if (!referrer_user) return true;
	
	// Can't self-refer (check for string equality)
	if (`${referrer_user.id}` === `${user_id}`) return false;

	// Create referral record
	await knex('Referrals').insert({
		referrer_id: referrer_user.id,
		referred_id: user_id,
		credits_reward: REFERRAL_CREDITS_REWARD,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	
	// Credit referred user
	const [referred_ok, referrer_ok] = await Promise.all([
		db_creditReferralUser(user_id, REFERRAL_CREDITS_REWARD),
		db_creditReferralUser(referrer_user.id, REFERRAL_CREDITS_REWARD),
	]);
	if (!referred_ok || !referrer_ok) return false;

	// Return success
	return true;
}


// -------------------
// DELETE Functions
// -------------------


// ----- Export -----
module.exports = {
	db_getCreditsBalance,
	db_getCreditBalance,
	db_getCreditBalanceHistory,
	db_getReferralInviteCode,
	db_getReferralInviteList,
	db_redeemInviteCode,
};