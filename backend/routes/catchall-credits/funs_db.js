// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// -------------------
// CREATE Functions
// -------------------

/**
 * Purchase catchall credits
 */
async function db_purchaseCatchallCredits(userId, credits, packageCode, sessionId) {
	let err_code;
	
	try {
		// Record the purchase attempt
		await knex('Stripe_Catchall_Purchases').insert({
			user_id: userId,
			session_id: sessionId, // Use provided session ID
			credits: credits,
			status: 'pending',
			created_at: new Date()
		});
		
		// Return success response
		return [true, {
			message: 'Catchall purchase initiated',
			packageCode: packageCode,
			credits: credits,
			status: 'pending'
		}];
	} catch (err) {
		console.error('Error processing catchall purchase:', err);
		return [false, err];
	}
}

/**
 * Use catchall credits from user balance
 */
async function db_useCatchallCredits(userId, credits, requestId = null) {
	let err_code;
	
	try {
		await knex.transaction(async (trx) => {
			// Get current balance
			const balance = await trx('Users_Catchall_Credit_Balance')
				.where('user_id', userId)
				.select('current_balance')
				.first();
			
			const currentBalance = balance ? balance.current_balance : 0;
			
			if (currentBalance < credits) {
				throw new Error(`Insufficient catchall credits. Current: ${currentBalance}, Required: ${credits}`);
			}
			
			// Update credit balance
			await trx('Users_Catchall_Credit_Balance')
				.where('user_id', userId)
				.update({
					current_balance: currentBalance - credits
				});
			
			// Add usage history
			await trx('Users_Catchall_Credit_Balance_History').insert({
				user_id: userId,
				credits_used: credits,
				usage_ts: new Date()
			});
		});
		
		// Return success response
		return [true, {
			message: 'Catchall credits used successfully',
			creditsUsed: credits,
			requestId: requestId,
			newBalance: (await knex('Users_Catchall_Credit_Balance')
				.where('user_id', userId)
				.select('current_balance')
				.first())?.current_balance || 0
		}];
	} catch (err) {
		console.error('Error using catchall credits:', err);
		return [false, err];
	}
}

// -------------------
// READ Functions
// -------------------

async function db_getCatchallReferralInviteCode(user_id) {
	let err_code;
	const db_resp = await knex('Users')
		.select('referral_code')
		.where('id', user_id)
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	return [true, db_resp?.referral_code];
}

async function db_getCatchallReferralInviteList(user_id) {
	let err_code;
	const db_resp = await knex('Referrals as r')
		.select(
			knex.raw('COUNT(DISTINCT r.referred_id) as num_referrals'),
			knex.raw('SUM(r.credits_reward) as total_referral_credits'),
			'u.id as referred_user_id',
			'u.email as referred_user_email',
			'u.created_ts as referred_user_joined_ts',
			'ucc.credit_balance as referred_user_credits'
		)
		.leftJoin('Users as u', 'r.referred_id', 'u.id')
		.leftJoin('Users_Catchall_Credits as ucc', 'r.referred_id', 'ucc.user_id')
		.where('r.referrer_id', user_id)
		.groupBy('r.referred_id', 'u.id', 'u.email', 'u.created_ts', 'ucc.credit_balance')
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
	db_purchaseCatchallCredits,
	db_useCatchallCredits,
	db_getCatchallReferralInviteCode,
	db_getCatchallReferralInviteList,
	db_getCatchallCreditBalance,
	db_getCatchallCreditBalanceHistory,
}; 