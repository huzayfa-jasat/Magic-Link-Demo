// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Constants
const REFERRAL_CREDITS_REWARD = 25000;
const MIN_SAVED_PER_100K_EMAILS = 18;
const COST_SAVED_PER_100K_EMAILS = 19;
const MIN_PURCHASE_FOR_REFERRAL_ELIGIBILITY = 100000;


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
	
	// Check user's eligibility based on lifetime purchases
	const userEligibility = await db_checkUserReferralEligibility(user_id);
	if (!userEligibility[0]) return [false, null];
	
	// Get approved referrals
	const approved_referrals = await knex('Referrals as r')
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
	
	// Get pending referrals
	const pending_referrals = await knex('Pending_Referrals as pr')
		.select(
			knex.raw('COUNT(DISTINCT pr.referred_id) as num_pending'),
			knex.raw('SUM(pr.credits_reward) as total_pending_credits'),
			'u.id as referred_user_id',
			'u.email as referred_user_email',
			'u.created_ts as referred_user_joined_ts',
			'pr.credits_reward as credits_reward',
			'pr.referrer_eligible',
			'pr.referred_eligible',
			'pr.status'
		)
		.leftJoin('Users as u', 'pr.referred_id', 'u.id')
		.where('pr.referrer_id', user_id)
		.where('pr.status', 'pending')
		.groupBy('pr.referred_id', 'u.id', 'u.email', 'u.created_ts', 'pr.credits_reward', 'pr.referrer_eligible', 'pr.referred_eligible', 'pr.status')
		.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) return [false, null];

	// Transform the data into the requested format
	const result = {
		num_referrals: approved_referrals.length,
		total_referral_credits: approved_referrals.reduce((sum, row) => sum + row.credits_reward, 0),
		referred_users: approved_referrals.map(row => ({
			id: row.referred_user_id,
			email: row.referred_user_email,
			joined_ts: row.referred_user_joined_ts,
			credits: row.credits_reward,
			status: 'approved'
		})),
		// New fields for pending referrals
		num_pending_referrals: pending_referrals.length,
		total_pending_credits: pending_referrals.reduce((sum, row) => sum + row.credits_reward, 0),
		pending_referrals: pending_referrals.map(row => ({
			id: row.referred_user_id,
			email: row.referred_user_email,
			joined_ts: row.referred_user_joined_ts,
			credits: row.credits_reward,
			status: 'pending',
			referrer_eligible: row.referrer_eligible,
			referred_eligible: row.referred_eligible
		})),
		user_eligible: userEligibility[1].is_eligible,
		user_lifetime_purchases: userEligibility[1].lifetime_purchases
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
	const db_resp = await knex('Users_Credit_Balance_History as h')
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
				END as list_name
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

async function db_checkUserReferralEligibility(user_id) {
	let err_code;
	
	// Get total purchased credits
	const [purchased_credits, purchased_catchall_credits] = await Promise.all([
		knex('Users_Credit_Balance_History')
			.where('user_id', user_id)
			.where('event_typ', 'purchase')
			.sum('credits_used as total_purchased')
			.first()
			.catch((err)=>{if (err) err_code = err.code}),
		knex('Users_Catchall_Credit_Balance_History')
			.where('user_id', user_id)
			.where('event_typ', 'purchase')
			.sum('credits_used as total_purchased')
			.first()
			.catch((err)=>{if (err) err_code = err.code})
	]);
	
	if (err_code) return [false, null];
	
	const total_purchased = (parseInt(purchased_credits.total_purchased) || 0) + (parseInt(purchased_catchall_credits.total_purchased) || 0);
	const is_eligible = total_purchased >= MIN_PURCHASE_FOR_REFERRAL_ELIGIBILITY;
	
	return [true, {
		is_eligible: is_eligible,
		lifetime_purchases: total_purchased,
		remaining_for_eligibility: is_eligible ? 0 : (MIN_PURCHASE_FOR_REFERRAL_ELIGIBILITY - total_purchased)
	}];
}

async function db_getPendingReferralsForUser(user_id) {
	let err_code;
	const pending_referrals = await knex('Pending_Referrals')
		.where('status', 'pending')
		.where(function() {
			this.where('referrer_id', user_id).orWhere('referred_id', user_id);
		})
		.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) return [false, null];
	return [true, pending_referrals || []];
}

async function db_updateUserReferralEligibility(user_id, pending_referral_id, is_referrer) {
	let err_code;
	const field_to_update = is_referrer ? 'referrer_eligible' : 'referred_eligible';
	
	await knex('Pending_Referrals')
		.where('id', pending_referral_id)
		.update({ [field_to_update]: 1 })
		.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) return false;
	return true;
}

async function db_approveEligibleReferral(pending_referral) {
	let err_code;
	
	// Use a transaction to ensure atomicity
	await knex.transaction(async trx => {
		// Create approved referral
		await trx('Referrals').insert({
			referrer_id: pending_referral.referrer_id,
			referred_id: pending_referral.referred_id,
			credits_reward: pending_referral.credits_reward,
		});
		
		// Update pending referral status
		await trx('Pending_Referrals')
			.where('id', pending_referral.id)
			.update({ status: 'approved', approved_ts: knex.fn.now() });
	}).catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) return false;
	
	// Credit both users (outside transaction to avoid locking issues)
	const [referred_ok, referrer_ok] = await Promise.all([
		db_creditReferralUser(pending_referral.referred_id, pending_referral.credits_reward),
		db_creditReferralUser(pending_referral.referrer_id, pending_referral.credits_reward),
	]);
	
	return referred_ok && referrer_ok;
}

async function db_processPendingReferralsForUser(user_id) {
	// Check if user is now eligible
	const eligibility = await db_checkUserReferralEligibility(user_id);
	if (!eligibility[0] || !eligibility[1].is_eligible) return false;
	
	// Get all pending referrals where this user is involved
	const [ok, pending_referrals] = await db_getPendingReferralsForUser(user_id);
	if (!ok || !pending_referrals.length) return false;
	
	// Process each pending referral
	for (const pending of pending_referrals) {
		// Update eligibility status for this user
		if (pending.referrer_id === user_id && !pending.referrer_eligible) {
			await db_updateUserReferralEligibility(user_id, pending.id, true);
		}
		if (pending.referred_id === user_id && !pending.referred_eligible) {
			await db_updateUserReferralEligibility(user_id, pending.id, false);
		}
		
		// Re-fetch to get updated eligibility status
		const updated_pending = await knex('Pending_Referrals')
			.where('id', pending.id)
			.first();
		
		// If both users are now eligible, approve the referral
		if (updated_pending && updated_pending.referrer_eligible && updated_pending.referred_eligible) {
			await db_approveEligibleReferral(updated_pending);
		}
	}
	
	return true;
}

async function db_getLifetimeStats(user_id) {
	let err_code;

	// Calculate bounced emails (invalid status)
	// Invalid means: (is_catchall = 0 OR is_catchall IS NULL) AND (status = 'undeliverable' OR (status = 'risky' AND reason != 'low_deliverability'))
	const bounced_deliverable = await knex('Email_Deliverable_Results as edr')
		.join('Batch_Emails_Deliverable as bed', 'bed.email_global_id', 'edr.email_global_id')
		.join('Batches_Deliverable as bd', 'bd.id', 'bed.batch_id')
		.where('bd.user_id', user_id)
		.where('bd.status', 'completed')
		.where('bed.did_complete', 1)
		.where(function() {
			this.where('edr.is_catchall', 0).orWhereNull('edr.is_catchall');
		})
		.where(function() {
			this.where('edr.status', 'undeliverable')
				.orWhere(function() {
					this.where('edr.status', 'risky').whereNot('edr.reason', 'low_deliverability');
				});
		})
		.count('* as bounced')
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Calculate total completed emails for mins calculation and lifetime purchased credits in parallel
	const [total_deliverable, total_catchall, purchased_credits, purchased_catchall_credits] = await Promise.all([
		knex('Batch_Emails_Deliverable as bed')
			.join('Batches_Deliverable as bd', 'bd.id', 'bed.batch_id')
			.where('bd.user_id', user_id)
			.where('bd.status', 'completed')
			.where('bed.did_complete', 1)
			.count('* as total')
			.first()
			.catch((err)=>{if (err) err_code = err.code}),
		knex('Batch_Emails_Catchall as bec')
			.join('Batches_Catchall as bc', 'bc.id', 'bec.batch_id')
			.where('bc.user_id', user_id)
			.where('bc.status', 'completed')
			.where('bec.did_complete', 1)
			.count('* as total')
			.first()
			.catch((err)=>{if (err) err_code = err.code}),
		knex('Users_Credit_Balance_History')
			.where('user_id', user_id)
			.where('event_typ', 'purchase')
			.sum('credits_used as total_purchased')
			.first()
			.catch((err)=>{if (err) err_code = err.code}),
		knex('Users_Catchall_Credit_Balance_History')
			.where('user_id', user_id)
			.where('event_typ', 'purchase')
			.sum('credits_used as total_purchased')
			.first()
			.catch((err)=>{if (err) err_code = err.code})
	]);
	if (err_code) return [false, null];

	// Calculate results
	const bounced = parseInt(bounced_deliverable.bounced) || 0;
	const total_emails = (parseInt(total_deliverable.total) || 0) + (parseInt(total_catchall.total) || 0);
	const mins = Math.round((MIN_SAVED_PER_100K_EMAILS * total_emails / 100000) * 10) / 10;
	const total_purchased_credits = (parseInt(purchased_credits.total_purchased) || 0) + (parseInt(purchased_catchall_credits.total_purchased) || 0);
	const cost = Math.round((COST_SAVED_PER_100K_EMAILS * total_purchased_credits / 100000) * 10) / 10;

	return [true, {
		bounced: bounced,
		mins: mins,
		cost: cost
	}];
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
	if (err_code || !referrer_user) return false;
	
	// Can't self-refer (check for string equality)
	if (`${referrer_user.id}` === `${user_id}`) return false;
	
	// Check if both users meet the 100k purchase requirement
	const [referrerEligibility, referredEligibility] = await Promise.all([
		db_checkUserReferralEligibility(referrer_user.id),
		db_checkUserReferralEligibility(user_id)
	]);
	
	if (!referrerEligibility[0] || !referredEligibility[0]) return false;
	
	const referrer_eligible = referrerEligibility[1].is_eligible;
	const referred_eligible = referredEligibility[1].is_eligible;
	
	// If both users are eligible, create approved referral and credit immediately
	if (referrer_eligible && referred_eligible) {
		// Create referral record
		await knex('Referrals').insert({
			referrer_id: referrer_user.id,
			referred_id: user_id,
			credits_reward: REFERRAL_CREDITS_REWARD,
		}).catch((err)=>{if (err) err_code = err.code});
		if (err_code) return false;
		
		// Credit both users
		const [referred_ok, referrer_ok] = await Promise.all([
			db_creditReferralUser(user_id, REFERRAL_CREDITS_REWARD),
			db_creditReferralUser(referrer_user.id, REFERRAL_CREDITS_REWARD),
		]);
		if (!referred_ok || !referrer_ok) return false;
	} else {
		// Create pending referral record
		await knex('Pending_Referrals').insert({
			referrer_id: referrer_user.id,
			referred_id: user_id,
			credits_reward: REFERRAL_CREDITS_REWARD,
			referrer_eligible: referrer_eligible ? 1 : 0,
			referred_eligible: referred_eligible ? 1 : 0,
			status: 'pending'
		}).catch((err)=>{if (err) err_code = err.code});
		if (err_code) return false;
	}

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
	db_getLifetimeStats,
	db_processPendingReferralsForUser,
};