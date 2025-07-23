// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const {
	getCreditTableName,
	getCreditHistoryTableName,
	getBatchTableName,
	getResultsTableName,
	getEmailBatchAssociationTableName
} = require('./funs_db_utils.js');

// Helper Functions
const formatResultsByCheckType = (results, check_type) => {
	return results.map((result)=>{
		let check_type_specific_result = {};

		// Handle check_type specific results
		switch (check_type) {
			case 'deliverable':
				// Handle "deliverable" type results (translate fields into "result")
				if (result.status === 'deliverable' && result.is_catchall === 0) check_type_specific_result.result = 1;
				else if ((result.is_catchall === 1) || (result.status === 'risky' && result.reason === 'low_deliverability')) check_type_specific_result.result = 2;
				else check_type_specific_result.result = 0;
				break;
			case 'catchall':
				// Handle "catchall" type results (translate fields into deliverability score)
				check_type_specific_result.score = result.toxicity;
				break;
			default:
				break;
		}

		// Return
		return {
			'email': result.email_nominal,
			...check_type_specific_result
		}
	});
}
const createBatchBaseQuery = (knex, tableName, categoryName, user_id, category) => {
	return knex(tableName)
		.select(
			'id',
			'title',
			'status', 
			'total_emails',
			'created_ts',
			'completed_ts',
			...(category === 'all' ? [knex.raw(`'${categoryName}' as category`)] : [])
		)
		.where({
			'user_id': user_id,
			'is_archived': 0,
		});
}
const applyBatchStatusFilter = (query, statusValues) => {
	if (statusValues && statusValues.length > 0) {
		return query.whereIn('status', statusValues);
	}
	return query;
}

// -------------------
// CREATE Functions
// -------------------

// Note: "emails_stripped" is an array of strings (stripped emails)
async function db_addGlobalEmails(emails_stripped) {
	let err_code;
	await knex('Emails_Global').insert(emails_stripped.map((email_stripped)=>({
		'email_stripped': email_stripped,
	}))).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}

// Note: "emails" is an array of objects [..., {'global_id': int, 'email': string (nominal) }, ...]
async function db_createBatch(user_id, check_type, title, emails) {
	// Get batch table names
	const batch_table = getBatchTableName(check_type);
	const results_table = getResultsTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!batch_table || !results_table || !email_batch_association_table) return [false, null];

	// 1. Create batch entry
	let err_code;
	const [batch_id] = await knex(batch_table).insert({
		'user_id': user_id,
		'title': title ?? 'Untitled',
		'status': 'queued',
		'total_emails': emails.length,
		'created_ts': new Date().toISOString(),
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// 2. Create batch emails association table entries
	await knex(email_batch_association_table).insert(emails.map((email)=>({
		'batch_id': batch_id,
		'email_global_id': email.global_id,
		'email_nominal': email.email,
	}))).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	
	// 3. Check cached results for existing results

	// - Retrieve ID's of existing results
	const existing_results = await knex(results_table).whereIn(
		'email_global_id', emails.map((email)=>email.global_id)
	).pluck(
		'email_global_id'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// - Update batch emails association table entries with cached results
	await knex(email_batch_association_table).whereIn(
		'email_global_id', existing_results
	).update({
		'used_cached': 1,
		'did_complete': 1,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// 4. Get "fresh" email ID's (not cached / need to be verified)
	const existing_results_set = new Set(existing_results);
	const fresh_email_ids = emails.filter((email)=>!existing_results_set.has(email.global_id)).map((email)=>email.global_id);

	// Return
	return [true, batch_id, fresh_email_ids];
}


// -------------------
// RETRIEVE Functions
// -------------------

/**
 * Check if the user has access to the batch
 * @param {number} user_id - The ID of the user
 * @param {number} batch_id - The ID of the batch
 * @param {string} check_type - The type of check (deliverable or catchall)
 * @returns {boolean} - True if the user has access to the batch, false otherwise
 */
async function db_checkUserBatchAccess(user_id, batch_id, check_type) {
	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return false;

	// Check database & return true if batch exists
	let err_code;
	const batch = await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id
	}).select(
		'id',
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code || batch.length <= 0) return false;
	return true;
}

// Note: "emails" is a dict {..., [stripped_email]: nominal_email, ...}
async function db_getEmailGlobalIds(emails_dict) {
	let err_code;

	// Retrieve emails
	const global_emails = await knex('Emails_Global').whereIn(
		'email_stripped', Object.keys(emails_dict)
	).select(
		'global_id', 'email_stripped'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Format result
	const email_global_ids = global_emails.map((global_email)=>{
		return {
			'global_id': global_email.global_id,
			'email': emails_dict[global_email.email_stripped],
		}
	});

	// Return result
	return [true, email_global_ids];
}

async function db_getBatchesList(user_id, page, limit, order, category, status) {
	// Handle sorting
	let order_column, order_direction;
	switch (order) {
		case 'timehl': case 'timelh':
			order_column = 'created_ts';
			order_direction = (order === 'timehl') ? 'desc' : 'asc';
			break;
		case 'counthl': case 'countlh':
			order_column = 'total_emails';
			order_direction = (order === 'counthl') ? 'desc' : 'asc';
			break;
		default:
			return [false, null];
	}

	// Create base queries for both tables
	const deliverable_query = createBatchBaseQuery(knex, 'Batches_Deliverable', 'deliverable', user_id, category);
	const catchall_query = createBatchBaseQuery(knex, 'Batches_Catchall', 'catchall', user_id, category);

	let status_filter;
	switch (status) {
		case 'processing':
			status_filter = ['processing', 'queued'];
			break;
		case 'completed':
			status_filter = ['completed'];
			break;
		case 'failed':
			status_filter = ['failed'];
			break;
		default:
			status_filter = null;
			break;
	}

	const deliverable_filtered = applyBatchStatusFilter(deliverable_query, status_filter);
	const catchall_filtered = applyBatchStatusFilter(catchall_query, status_filter);

	// Create final base query based on category
	let base_query;
	switch (category) {
		case 'all':
			base_query = deliverable_filtered.union(catchall_filtered);
			break;
		case 'deliverable':
			base_query = deliverable_filtered;
			break;
		case 'catchall':
			base_query = catchall_filtered;
			break;
		default:
			return [false, null];
	}


	// Get batches list
	let err_code;
	let batches;
	if (category === 'all') {
		// For union queries, we need to wrap in a subquery to apply sorting and pagination
		batches = await knex.from(base_query.as('union_result'))
			.select(
				'id',
				'title',
				'status',
				'total_emails AS emails',
				'created_ts AS created',
				'completed_ts AS completed',
				'category'
			)
			.limit(limit).offset((page-1)*limit)
			.orderBy(order_column, order_direction)
			.catch((err)=>{if (err) err_code = err.code});
	} else {
		batches = await base_query.select(
			'id',
			'title',
			'status',
			'total_emails AS emails',
			'created_ts AS created',
			'completed_ts AS completed',
		)
		.limit(limit).offset((page-1)*limit)
		.orderBy(order_column, order_direction)
		.catch((err)=>{if (err) err_code = err.code});
	}
	if (err_code) return [false, null];

	// Format batches list
	// - Mask "queued" as "processing"
	const formatted_batches = batches.map((batch)=>({
		...batch,
		status: (batch.status === 'queued') ? 'processing' : batch.status
	}));

	// Get metadata
	let total_count = 0;
	if (category === 'all') {
		// Get total count for union query - create base queries
		let del_count_query = knex('Batches_Deliverable').where({
			'user_id': user_id,
			'is_archived': 0,
		});
		let cat_count_query = knex('Batches_Catchall').where({
			'user_id': user_id,
			'is_archived': 0,
		});
		
		// Apply status filters using the same logic as before
		del_count_query = applyBatchStatusFilter(del_count_query, status_filter);
		cat_count_query = applyBatchStatusFilter(cat_count_query, status_filter);
		
		// Execute count queries in parallel
		const counts = await Promise.all([
			del_count_query.count('* as count'),
			cat_count_query.count('* as count')
		]);
		total_count = parseInt(counts[0][0].count) + parseInt(counts[1][0].count);
	} else {
		// Get total count for single table
		let count_base_query;
		switch (category) {
			case 'deliverable':
				count_base_query = knex('Batches_Deliverable').where({
					'user_id': user_id,
					'is_archived': 0,
				});
				break;
			case 'catchall':
				count_base_query = knex('Batches_Catchall').where({
					'user_id': user_id,
					'is_archived': 0,
				});
				break;
		}
		
		// Apply status filters using same helper function
		count_base_query = applyBatchStatusFilter(count_base_query, status_filter);
		
		const count_result = await count_base_query.count('* as count');
		total_count = parseInt(count_result[0].count);
	}
	
	const total_pages = Math.ceil(total_count / limit);
	const has_more = page < total_pages;
	
	const metadata = {
		total_pages,
		total_count,
		has_more,
	}

	// Return data + metadata
	return [true, formatted_batches, metadata];
}

async function db_getBatchDetails(user_id, check_type, batch_id) {
	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return [false, null];

	// Get batch details
	let err_code;
	const batch = await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
		'is_archived': 0
	}).select(
		'title AS title',
		'status AS status',
		'total_emails AS emails',
		'created_ts AS created',
		'completed_ts AS completed',
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code || batch.length <= 0) return [false, null];

	// Format batch details
	// - Mask "queued" as "processing"
	const batch_details = {
		...batch[0],
		status: (batch[0].status === 'queued') ? 'processing' : batch[0].status
	}

	// Return batch details
	return [true, batch_details];
}

async function db_getBatchResults(user_id, check_type, batch_id, page, limit, order, filter) {
	let err_code;

	// Get table names
	const batch_table = getBatchTableName(check_type);
	const results_table = getResultsTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!results_table || !email_batch_association_table) return [false, null];

	// Ensure batch is completed (and not archived)
	const batch = await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
		'is_archived': 0,
		'status': 'completed',
	}).select('id').catch((err)=>{if (err) err_code = err.code});
	if (err_code || batch.length <= 0) return [false, null];

	// Get results columns
	let results_columns;
	switch (check_type) {
		case 'deliverable':
			results_columns = ['email_nominal', 'status', 'reason', 'is_catchall', 'score', 'provider', 'updated_ts'];
			break;
		case 'catchall':
			results_columns = ['email_nominal', 'toxicity', 'updated_ts'];
			break;
		default:
			return [false, null];
	}

	// Handle sorting
	let order_column, order_direction;
	switch (order) {
		case 'timehl': case 'timelh':
			order_column = 'updated_ts';
			order_direction = (order === 'timehl') ? 'desc' : 'asc';
			break;
		case 'scorehl': case 'scorelh':
			if (check_type === 'deliverable') return [false, null]; // Enforce catchall-only sort
			order_column = 'toxicity';
			order_direction = (order === 'scorehl') ? 'desc' : 'asc';
			break;
		default:
			return [false, null];
	}

	// Construct base query (before filters)
	let base_query = knex(results_table).join(
		email_batch_association_table,
		`${email_batch_association_table}.email_global_id`,
		`${results_table}.email_global_id`
	).where({
		[`${email_batch_association_table}.batch_id`]: batch_id,
		[`${email_batch_association_table}.did_complete`]: 1,
	});

	// Handle filtering
	switch (filter) {
		case 'all':
			break;
		case 'deliverable':
			base_query = base_query.where({
				[`${results_table}.status`]: 'deliverable',
				[`${results_table}.is_catchall`]: 0,
			});
			break;
		case 'catchall':
			base_query = base_query.where({
				[`${results_table}.status`]: 'risky',
				[`${results_table}.reason`]: 'low_deliverability',
			}).orWhere({
				[`${results_table}.is_catchall`]: 1,
			});
			break;
		case 'undeliverable':
			base_query = base_query.whereNot(function () {
				this.where({
					[`${results_table}.status`]: 'deliverable',
					[`${results_table}.is_catchall`]: 0,
				}).orWhere({
					[`${results_table}.status`]: 'risky',
					[`${results_table}.reason`]: 'low_deliverability',
				}).orWhere({
					[`${results_table}.is_catchall`]: 1,
				});
			});
			break;
		default:
			break;
	}

	// Get batch results
	const results = await base_query.select(
		results_columns
	).limit(limit).offset((page-1)*limit) // Apply pagination
	.orderBy(`${results_table}.${order_column}`, order_direction) // Apply sorting
	.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Format results (by check type)
	const formatted_results = formatResultsByCheckType(results, check_type);

	// Get metadata - count total results matching filters
	let count_query = knex(results_table).join(
		email_batch_association_table,
		`${email_batch_association_table}.email_global_id`,
		`${results_table}.email_global_id`
	).where({
		[`${email_batch_association_table}.batch_id`]: batch_id,
		[`${email_batch_association_table}.did_complete`]: 1,
	});

	// Apply same filtering to count query
	switch (filter) {
		case 'all':
			break;
		case 'deliverable':
			count_query = count_query.where({
				[`${results_table}.status`]: 'deliverable',
				[`${results_table}.is_catchall`]: 0,
			});
			break;
		case 'catchall':
			count_query = count_query.where({
				[`${results_table}.status`]: 'risky',
				[`${results_table}.reason`]: 'low_deliverability',
			}).orWhere({
				[`${results_table}.is_catchall`]: 1,
			});
			break;
		case 'undeliverable':
			count_query = count_query.whereNot(function () {
				this.where({
					[`${results_table}.status`]: 'deliverable',
					[`${results_table}.is_catchall`]: 0,
				}).orWhere({
					[`${results_table}.status`]: 'risky',
					[`${results_table}.reason`]: 'low_deliverability',
				}).orWhere({
					[`${results_table}.is_catchall`]: 1,
				});
			});
			break;
	}

	const count_result = await count_query.count('* as count').catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];
	
	const total_count = parseInt(count_result[0].count);
	const total_pages = Math.ceil(total_count / limit);
	const has_more = page < total_pages;
	
	const metadata = {
		total_pages,
		total_count,
		has_more,
	}

	// Return results + metadata
	return [true, formatted_results, metadata];
}


// -------------------
// UPDATE Functions
// -------------------

async function db_checkAndDeductCredits(user_id, check_type, num_emails) {
	// Get table names
	const credit_table = getCreditTableName(check_type);
	const credit_history_table = getCreditHistoryTableName(check_type);
	if (!credit_table || !credit_history_table) return [false, null];
	
	// Transaction to check credit balance, deduct credits, and log usage
	// - Automatically rolls back on any error
	// - Row lock released after transaction completes
	try {
		const result = await knex.transaction(async (trx) => {
			// Step 1: Check credit balance
			const curr_balance = await trx(credit_table)
				.where({ 'user_id': user_id })
				.select('current_balance')
				.forUpdate() // Row lock to prevent race conditions
				.first();
			
			// Verify sufficient balance
			if (!curr_balance || curr_balance.current_balance < num_emails) {
				throw new Error('Insufficient credits');
			}

			// Step 2: Deduct credits
			await trx(credit_table)
				.where({ 'user_id': user_id })
				.decrement('current_balance', num_emails);

			// Step 3: Log usage in history
			await trx(credit_history_table).insert({
				'user_id': user_id,
				'credits_used': num_emails,
				'event_typ': 'usage',
				'created_ts': new Date().toISOString()
			});

			// Calculate new balance after deduction
			const new_balance = curr_balance.current_balance - num_emails;

			// Transaction successful - return true and new balance
			return [true, new_balance];
		});

		return result;

	} catch (error) {
		// Transaction automatically rolled back on any error
		console.error('Credit deduction transaction failed:', error.message);
		return [false, null];
	}
}


// -------------------
// DELETE Functions
// -------------------

async function db_removeBatch(user_id, check_type, batch_id) {
	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return false;

	// Remove batch
	let err_code;
	await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
	}).update({
		'is_archived': 1
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;
	return true;
}


// Exports
module.exports = {
	db_checkUserBatchAccess,
	db_addGlobalEmails,
	db_createBatch,
	db_getEmailGlobalIds,
	db_getBatchesList,
	db_getBatchDetails,
	db_getBatchResults,
	db_checkAndDeductCredits,
	db_removeBatch
}