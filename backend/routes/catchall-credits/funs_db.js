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

/**
 * Use catchall credits from user balance
 */
// async function db_useCatchallCredits(userId, credits, requestId = null) {
// 	let err_code;
	
// 	try {
// 		await knex.transaction(async (trx) => {
// 			// Get current balance
// 			const balance = await trx('Users_Catchall_Credit_Balance')
// 				.where('user_id', userId)
// 				.select('current_balance')
// 				.first();
			
// 			const currentBalance = balance ? balance.current_balance : 0;
			
// 			if (currentBalance < credits) {
// 				throw new Error(`Insufficient catchall credits. Current: ${currentBalance}, Required: ${credits}`);
// 			}
			
// 			// Update credit balance
// 			await trx('Users_Catchall_Credit_Balance')
// 				.where('user_id', userId)
// 				.update({
// 					current_balance: currentBalance - credits
// 				});
			
// 			// Add usage history
// 			await trx('Users_Catchall_Credit_Balance_History').insert({
// 				user_id: userId,
// 				credits_used: credits,
// 				usage_ts: new Date()
// 			});
// 		});
		
// 		// Return success response
// 		return [true, {
// 			message: 'Catchall credits used successfully',
// 			creditsUsed: credits,
// 			requestId: requestId,
// 			newBalance: (await knex('Users_Catchall_Credit_Balance')
// 				.where('user_id', userId)
// 				.select('current_balance')
// 				.first())?.current_balance || 0
// 		}];
// 	} catch (err) {
// 		console.error('Error using catchall credits:', err);
// 		return [false, err];
// 	}
// }

// -------------------
// DELETE Functions
// -------------------

// ----- Export -----
module.exports = {
	// db_useCatchallCredits,
	db_getCatchallCreditBalance,
	db_getCatchallCreditBalanceHistory,
}; 