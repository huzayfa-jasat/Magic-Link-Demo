// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const { resend_sendBatchCompletionEmail } = require('../../external_apis/resend.js');
const {
	getCreditTableName,
	getCreditHistoryTableName,
	getBatchTableName,
	getResultsTableName,
	getEmailBatchAssociationTableName
} = require('./funs_db_utils.js');

// Helper Functions
const translateToxicityScore = (toxicity) => {
	switch (toxicity) {
		case 0:
			return 'good';
		case 1: case 2: case 3:
			return 'risky';
		case 4: case 5:
			return 'bad';
		default:
			return 'unknown';
	}
}
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
				// Add provider
				check_type_specific_result.provider = result.provider;
				break;
			case 'catchall':
				// Handle "catchall" type results (translate fields into deliverability score)
				check_type_specific_result.score = translateToxicityScore(result.toxicity);
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
	}))).onConflict().ignore().catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("EMAILS_GLOBAL INSERT ERROR = ", err_code);
		return false;
	}
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
	const insert_result = await knex(batch_table).insert({
		'user_id': user_id,
		'title': title ?? 'Untitled',
		'status': 'queued',
		'total_emails': emails.length,
		'created_ts': knex.fn.now(),
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 1 = ", err_code);
		return [false, null];
	}
	
	// MySQL typically returns an array with insertId
	const [batch_id] = insert_result;
	console.log('batch_id after destructuring:', batch_id);
	
	if (!batch_id) return [false, null];

	// 2. Create batch emails association table entries
	await knex(email_batch_association_table).insert(emails.map((email)=>({
		'batch_id': batch_id,
		'email_global_id': email.global_id,
		'email_nominal': email.email,
	}))).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 2 = ", err_code);
		return [false, null];
	}
	
	// 3. Check cached results for existing results

	// - Retrieve ID's of existing results
	const existing_results = await knex(results_table).whereIn(
		'email_global_id', emails.map((email)=>email.global_id)
	).pluck(
		'email_global_id'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 3 = ", err_code);
		return [false, null];
	}

	// - Update batch emails association table entries with cached results
	await knex(email_batch_association_table).whereIn(
		'email_global_id', existing_results
	).update({
		'used_cached': 1,
		'did_complete': 1,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 4 = ", err_code);
		return [false, null];
	}

	// 4. Get "fresh" email ID's (not cached / need to be verified)
	const existing_results_set = new Set(existing_results);
	const fresh_email_ids = emails.filter((email)=>!existing_results_set.has(email.global_id)).map((email)=>email.global_id);

	// 5. Handle edge case: if all emails were cached, mark batch as completed immediately
	if (fresh_email_ids.length === 0 && existing_results.length === emails.length) {
		await knex(batch_table).where({
			'id': batch_id
		}).update({
			'status': 'completed',
			'completed_ts': knex.fn.now()
		}).catch((err)=>{if (err) err_code = err.code});
		if (err_code) {
			console.log("BATCH INSERT ERR 5 (update to completed) = ", err_code);
			return [false, null];
		}
		
		// Send batch completion email notification
		await db_sendBatchCompletionEmail(user_id, check_type, batch_id);
	}

	// Return
	return [true, batch_id, fresh_email_ids];
}

// Add emails to existing batch
async function db_addToBatch(user_id, check_type, batch_id, emails) {
	// Get batch table names
	const batch_table = getBatchTableName(check_type);
	const results_table = getResultsTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!batch_table || !results_table || !email_batch_association_table) return [false, null];

	// Verify batch exists and belongs to user
	let err_code;
	const existing_batch = await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
		'status': 'draft' // Only allow adding to draft batches
	}).select('id', 'total_emails').catch((err)=>{if (err) err_code = err.code});
	if (err_code || existing_batch.length === 0) return [false, null];

	// Add batch emails association table entries
	await knex(email_batch_association_table).insert(emails.map((email)=>({
		'batch_id': batch_id,
		'email_global_id': email.global_id,
		'email_nominal': email.email,
	}))).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Update total email count
	await knex(batch_table).where({
		'id': batch_id
	}).update({
		'total_emails': existing_batch[0].total_emails + emails.length
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Check cached results for existing results
	const existing_results = await knex(results_table).whereIn(
		'email_global_id', emails.map((email)=>email.global_id)
	).pluck(
		'email_global_id'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Update batch emails association table entries with cached results
	await knex(email_batch_association_table).whereIn(
		'email_global_id', existing_results
	).where('batch_id', batch_id).update({
		'used_cached': 1,
		'did_complete': 1,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	return [true, batch_id];
}

// Modify db_createBatch to create batches in draft status initially
async function db_createBatchDraft(user_id, check_type, title, emails) {
	// Get batch table names
	const batch_table = getBatchTableName(check_type);
	const results_table = getResultsTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!batch_table || !results_table || !email_batch_association_table) return [false, null];

	// 1. Create batch entry in draft status
	let err_code;
	const insert_result = await knex(batch_table).insert({
		'user_id': user_id,
		'title': title ?? 'Untitled',
		'status': 'draft', // Start as draft
		'total_emails': emails.length,
		'created_ts': knex.fn.now(),
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 1 = ", err_code);
		return [false, null];
	}
	
	// MySQL typically returns an array with insertId
	const [batch_id] = insert_result;
	console.log('batch_id after destructuring:', batch_id);
	
	if (!batch_id) return [false, null];

	// 2. Create batch emails association table entries
	await knex(email_batch_association_table).insert(emails.map((email)=>({
		'batch_id': batch_id,
		'email_global_id': email.global_id,
		'email_nominal': email.email,
	}))).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 2 = ", err_code);
		return [false, null];
	}
	
	// 3. Check cached results for existing results
	const existing_results = await knex(results_table).whereIn(
		'email_global_id', emails.map((email)=>email.global_id)
	).pluck(
		'email_global_id'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 3 = ", err_code);
		return [false, null];
	}

	// Update batch emails association table entries with cached results
	await knex(email_batch_association_table).whereIn(
		'email_global_id', existing_results
	).where('batch_id', batch_id).update({
		'used_cached': 1,
		'did_complete': 1,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH INSERT ERR 4 = ", err_code);
		return [false, null];
	}

	// Get "fresh" email ID's (not cached / need to be verified)
	const existing_results_set = new Set(existing_results);
	const fresh_email_ids = emails.filter((email)=>!existing_results_set.has(email.global_id)).map((email)=>email.global_id);

	// Handle edge case: if all emails were cached, mark batch as completed immediately
	if (fresh_email_ids.length === 0 && existing_results.length === emails.length) {
		await knex(batch_table).where({
			'id': batch_id
		}).update({
			'status': 'completed',
			'completed_ts': knex.fn.now()
		}).catch((err)=>{if (err) err_code = err.code});
		if (err_code) {
			console.log("BATCH INSERT ERR 5 (update to completed) = ", err_code);
			return [false, null];
		}
		
		// Send batch completion email notification
		await db_sendBatchCompletionEmail(user_id, check_type, batch_id);
	}

	// Return
	return [true, batch_id, fresh_email_ids];
}

async function db_createBatchWithEstimate(user_id, check_type, title, estimated_emails) {
	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return [false, null];

	// Create batch entry in draft status with zero email count (will be incremented by addToBatch)
	let err_code;
	const insert_result = await knex(batch_table).insert({
		'user_id': user_id,
		'title': title ?? 'Untitled',
		'status': 'draft', // Start as draft
		'total_emails': 0, // Start at 0, addToBatch will increment with actual count
		'created_ts': knex.fn.now(),
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) {
		console.log("BATCH ESTIMATE INSERT ERR = ", err_code);
		return [false, null];
	}
	
	// MySQL typically returns an array with insertId
	const [batch_id] = insert_result;
	console.log('batch_id after destructuring (estimate):', batch_id);
	
	if (!batch_id) return [false, null];

	// Return batch ID - no emails added yet
	return [true, batch_id];
}


// -------------------
// RETRIEVE Functions
// -------------------

/**
 * Get user email by user_id
 * @param {number} user_id - User ID
 * @returns {Promise<[boolean, string|null]>} - [success, email]
 */
async function db_getUserEmail(user_id) {
	let err_code;
	
	const db_resp = await knex('Users').where('id', user_id).select('email AS email').limit(1).catch((err)=>{if (err) err_code = err.code});
	if (err_code || db_resp.length <= 0) return [false, null];
	
	return [true, db_resp[0].email];
}

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
			status_filter = ['processing', 'queued', 'draft', 'pending'];
			break;
		case 'paused':
			status_filter = ['paused'];
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
	// - Add progress for deliverable batches that are processing
	const formatted_batches = await Promise.all(batches.map(async (batch) => {
		const formatted = {
			...batch,
			status: (batch.status === 'queued' || batch.status === 'draft' || batch.status === 'pending') ? 'processing' : batch.status
		};
		
		// Add progress for any processing batch
		if (formatted.status === 'processing') {
			// Determine batch type from the batch row itself
			// When category='all', batch.category is set from the query
			// Otherwise, we need to infer it from the category parameter
			const batchType = batch.category || category;
			
			if (batchType === 'deliverable') {
				try {
					// Calculate progress from bouncer batches
					const processed_result = await knex('Bouncer_Batches_Deliverable')
						.where('user_batch_id', batch.id)
						.sum('processed as total_processed')
						.first();
					
					const total_processed = parseInt(processed_result.total_processed) || 0;
					const total_with_cached = total_processed + (batch.cached_results || 0);
					
					// Calculate percentage
					const progress = batch.emails > 0 
						? Math.round((total_with_cached / batch.emails) * 100)
						: 0;
					
					formatted.progress = Math.min(progress, 99); // Cap at 99% until batch is marked completed
				} catch (error) {
					console.error(`Error calculating progress for deliverable batch ${batch.id}:`, error);
					formatted.progress = 0;
				}
			} else if (batchType === 'catchall') {
				try {
					// Count completed emails in the batch
					const completed_result = await knex('Batch_Emails_Catchall')
						.where({
							'batch_id': batch.id,
							'did_complete': 1
						})
						.count('* as total_completed')
						.first();
					
					const total_completed = parseInt(completed_result.total_completed) || 0;
					
					// Calculate percentage (completed emails / total emails)
					const progress = batch.emails > 0 
						? Math.round((total_completed / batch.emails) * 100)
						: 0;
					
					formatted.progress = Math.min(progress, 99); // Cap at 99% until batch is marked completed
				} catch (error) {
					console.error(`Error calculating progress for catchall batch ${batch.id}:`, error);
					formatted.progress = 0;
				}
			}
		}
		
		return formatted;
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

async function db_getDeliverableBatchStats(batch_id) {
	let err_code;

	// Get table names
	const results_table = getResultsTableName('deliverable');
	const email_batch_association_table = getEmailBatchAssociationTableName('deliverable');
	if (!results_table || !email_batch_association_table) return [false, null];

	// Get stats
	const [stats] = await knex(results_table).join(
		email_batch_association_table,
		`${email_batch_association_table}.email_global_id`,
		`${results_table}.email_global_id`
	).where({
		[`${email_batch_association_table}.batch_id`]: batch_id,
		[`${email_batch_association_table}.did_complete`]: 1,
	}).select(
		knex.raw(`SUM(CASE WHEN ${results_table}.status = 'deliverable' AND ${results_table}.is_catchall = 0 THEN 1 ELSE 0 END) as valid`),
		knex.raw(`SUM(CASE 
			WHEN ${results_table}.is_catchall = 1 OR (${results_table}.status = 'risky' AND ${results_table}.reason = 'low_deliverability') THEN 1 
			ELSE 0 
		END) as catchall`),
		knex.raw(`SUM(CASE 
			WHEN (${results_table}.is_catchall = 0 OR ${results_table}.is_catchall IS NULL) 
			AND (${results_table}.status = 'undeliverable' OR (${results_table}.status = 'risky' AND ${results_table}.reason != 'low_deliverability')) THEN 1 
			ELSE 0 
		END) as invalid`)
	).catch((err)=>{if (err) err_code = err});
	if (err_code || !stats) {
		console.log("DELIVERABLE BATCH STATS ERR = ", err_code);
		return [false, null];
	}
	
	// Return
	return [true, {
		valid: stats.valid ?? 0,
		invalid: stats.invalid ?? 0,
		catchall: stats.catchall ?? 0,
	}];
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
	let batch_details = {
		...batch[0],
		status: (batch[0].status === 'queued') ? 'processing' : batch[0].status
	}

	// If completed "deliverable" batch, get stats
	if (check_type === 'deliverable' && batch[0].status === 'completed') {
		// Get stats
		const [stats_ok, stats_dict] = await db_getDeliverableBatchStats(batch_id);
		if (!stats_ok) return [false, null];
		batch_details.stats = stats_dict;
	}

	// Return batch details
	return [true, batch_details];
}

async function db_getBatchResults(user_id, check_type, batch_id, page, limit, order, filter, search = '') {
	let err_code;

	// Get table names
	const batch_table = getBatchTableName(check_type);
	const results_table = getResultsTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!batch_table || !results_table || !email_batch_association_table) return [false, null];

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
			base_query = base_query.where(function() {
				this.where({
					[`${results_table}.status`]: 'risky',
					[`${results_table}.reason`]: 'low_deliverability',
				}).orWhere({
					[`${results_table}.is_catchall`]: 1,
				});
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
		case 'good':
			base_query = base_query.where('toxicity', 0);
			break;
		case 'risky':
			base_query = base_query.whereIn('toxicity', [1, 2, 3]);
			break;
		case 'bad':
			base_query = base_query.whereIn('toxicity', [4, 5]);
			break;
		default:
			break;
	}

	// Handle search
	if (search && search.trim()) {
		base_query = base_query.where(`${email_batch_association_table}.email_nominal`, 'like', `%${search.toLowerCase()}%`);
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
			count_query = count_query.where(function() {
				this.where({
					[`${results_table}.status`]: 'risky',
					[`${results_table}.reason`]: 'low_deliverability',
				}).orWhere({
					[`${results_table}.is_catchall`]: 1,
				});
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
		case 'good':
			count_query = count_query.where('toxicity', 0);
			break;
		case 'risky':
			count_query = count_query.whereIn('toxicity', [1, 2, 3]);
			break;
		case 'bad':
			count_query = count_query.whereIn('toxicity', [4, 5]);
			break;
	}

	// Apply same search filter to count query
	if (search && search.trim()) {
		count_query = count_query.where(`${email_batch_association_table}.email_nominal`, 'like', `%${search.toLowerCase()}%`);
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

async function db_getBatchProgress(user_id, batch_id) {
	try {
		// Get batch details first to ensure it exists and user has access
		const batch_table = getBatchTableName('deliverable');
		const batch = await knex(batch_table)
			.where({
				'id': batch_id,
				'user_id': user_id
			})
			.select('id', 'total_emails', 'cached_results', 'status')
			.first();
		
		if (!batch) return [false, null];
		
		// If batch is completed, return 100% progress
		if (batch.status === 'completed') {
			return [true, {
				progress: 100,
				processed: batch.total_emails,
				total: batch.total_emails,
				cached_results: batch.cached_results
			}];
		}
		
		// If batch is not processing, return 0% progress
		if (batch.status !== 'processing') {
			return [true, {
				progress: 0,
				processed: 0,
				total: batch.total_emails,
				cached_results: batch.cached_results
			}];
		}
		
		// Calculate progress from bouncer batches
		const processed_result = await knex('Bouncer_Batches_Deliverable')
			.where('user_batch_id', batch_id)
			.sum('processed as total_processed')
			.first();
		
		const total_processed = parseInt(processed_result.total_processed) || 0;
		const total_with_cached = total_processed + batch.cached_results;
		
		// Calculate percentage
		const progress = batch.total_emails > 0 
			? Math.round((total_with_cached / batch.total_emails) * 100)
			: 0;
		
		return [true, {
			progress: Math.min(progress, 99), // Cap at 99% until batch is marked completed
			processed: total_with_cached,
			total: batch.total_emails,
			cached_results: batch.cached_results
		}];
		
	} catch (error) {
		console.error('Error getting batch progress:', error);
		return [false, null];
	}
}

async function db_checkDuplicateFilename(user_id, filename) {
	let err_code;

	// Check deliverable batches first
	const deliverable_table = getBatchTableName('deliverable');
	const deliverable_result = await knex(deliverable_table)
		.where({
			'user_id': user_id,
			'title': filename,
			'is_archived': 0
		})
		.select('id')
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) {
		console.log("CHECK DUPLICATE FILENAME DELIVERABLE ERR = ", err_code);
		return [false, null];
	}

	if (deliverable_result) {
		return [true, {
			check_type: 'deliverable',
			batch_id: deliverable_result.id
		}];
	}

	// Check catchall batches
	const catchall_table = getBatchTableName('catchall');
	const catchall_result = await knex(catchall_table)
		.where({
			'user_id': user_id,
			'title': filename,
			'is_archived': 0
		})
		.select('id')
		.first()
		.catch((err)=>{if (err) err_code = err.code});
	
	if (err_code) {
		console.log("CHECK DUPLICATE FILENAME CATCHALL ERR = ", err_code);
		return [false, null];
	}

	if (catchall_result) {
		return [true, {
			check_type: 'catchall',
			batch_id: catchall_result.id
		}];
	}

	// No duplicate found
	return [true, null];
}

/**
 * Send batch completion email notification
 * @param {number} user_id - User ID
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @param {number} batch_id - Batch ID
 */
async function db_sendBatchCompletionEmail(user_id, check_type, batch_id) {
	// Get batch details
	const [batch_ok, batch_details] = await db_getBatchDetails(user_id, check_type, batch_id);
	if (!batch_ok) return;

	// Get user email
	const [email_ok, user_email] = await db_getUserEmail(user_id);
	if (!email_ok) return;

	// Send batch completion email
	try {
		const email_result = await resend_sendBatchCompletionEmail(
			user_email,
			batch_details.title || 'Untitled Batch',
			check_type,
			batch_id
		);
		
		if (email_result.error) {
			console.log(`⚠️ Failed to send batch completion email for batch ${batch_id}:`, email_result.error);
		} else {
			console.log(`📧 Batch completion email sent for batch ${batch_id}`);
		}
	} catch (email_error) {
		console.log(`⚠️ Error sending batch completion email for batch ${batch_id}:`, email_error);
	}
}


// -------------------
// UPDATE Functions
// -------------------

async function db_checkCreditsOnly(user_id, check_type, num_emails) {
	// Get table names
	const credit_table = getCreditTableName(check_type);
	if (!credit_table) return [false, null];
	
	try {
		// Check credit balance only - no deduction
		const curr_balance = await knex(credit_table)
			.where({ 'user_id': user_id })
			.select('current_balance')
			.first();
		
		// Verify sufficient balance
		if (!curr_balance || curr_balance.current_balance < num_emails) {
			return [false, null];
		}

		// Return success with current balance
		return [true, curr_balance.current_balance];

	} catch (error) {
		console.error('Credit check failed:', error.message);
		return [false, null];
	}
}

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
				'usage_ts': knex.fn.now()
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

async function db_deductCreditsForActualBatch(user_id, check_type, batch_id) {
	// Get table names
	const credit_table = getCreditTableName(check_type);
	const credit_history_table = getCreditHistoryTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!credit_table || !credit_history_table || !email_batch_association_table) return [false, null];
	
	try {
		const result = await knex.transaction(async (trx) => {
			// Get total number of emails associated with this batch (including cached ones)
			const email_count = await trx(email_batch_association_table)
				.where({ 'batch_id': batch_id })
				.count('* as count')
				.first();
			
			const actual_email_count = email_count.count;
			console.log("ACTUAL EMAIL COUNT = ", actual_email_count);
			
			// Check credit balance
			const curr_balance = await trx(credit_table)
				.where({ 'user_id': user_id })
				.select('current_balance')
				.forUpdate() // Row lock to prevent race conditions
				.first();
			
			// Verify sufficient balance
			if (!curr_balance || curr_balance.current_balance < actual_email_count) {
				console.log("Err 2");
				throw new Error('Insufficient credits for actual batch size');
			}

			// Deduct credits based on actual email count
			await trx(credit_table)
				.where({ 'user_id': user_id })
				.decrement('current_balance', actual_email_count);

			// Log usage in history (only if credits were actually deducted)
			if (actual_email_count > 0) {
				await trx(credit_history_table).insert({
					'user_id': user_id,
					'credits_used': actual_email_count,
					'event_typ': 'usage',
					'usage_ts': knex.fn.now()
				});
			}

			// Calculate new balance after deduction
			const new_balance = curr_balance.current_balance - actual_email_count;

			// Return success with new balance and actual email count
			return [true, new_balance, actual_email_count];
		});

		return result;

	} catch (error) {
		console.error('Credit deduction for batch failed:', error.message);
		return [false, null, 0];
	}
}

async function db_startBatchProcessing(user_id, check_type, batch_id) {
	let err_code;
	
	// Get table names
	const batch_table = getBatchTableName(check_type);
	const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
	if (!batch_table || !email_batch_association_table) return false;

	// Handle edge case: if all emails were cached, mark batch as completed immediately
	const non_cached_email = await knex(email_batch_association_table).where({
		'batch_id': batch_id,
		'used_cached': 0,
	}).select(
		'email_global_id'
	).limit(1).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Construct status update dict
	let status_update_dict = { 'status': 'queued' };
	let is_completed = false;
	if (non_cached_email.length === 0) {
		status_update_dict = {
			'status': 'completed',
			'completed_ts': knex.fn.now()
		};
		is_completed = true;
	}

	// Update status accordingly
	await knex(batch_table).where({
		'id': batch_id,
		'status': 'draft'
	}).update(
		status_update_dict,
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Send batch completion email notification if batch was completed
	if (is_completed) {
		await db_sendBatchCompletionEmail(user_id, check_type, batch_id);
	}

	// Return
	return true;
}

async function db_pauseBatchProcessing(user_id, check_type, batch_id) {
	let err_code;

	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return false;
	
	// Update status to paused
	await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
	}).whereIn('status', ['draft', 'queued', 'processing']).update({
		'status': 'paused'
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Return
	return true;
}

async function db_resumeBatchProcessing(user_id, check_type, batch_id) {
	let err_code;

	// Get batch table name
	const batch_table = getBatchTableName(check_type);
	if (!batch_table) return false;
	
	// Update status to processing
	await knex(batch_table).where({
		'id': batch_id,
		'user_id': user_id,
		'status': 'paused'
	}).update({
		'status': 'processing'
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) return false;

	// Return
	return true;
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
	db_getBatchProgress,
	db_removeBatch,
	db_addToBatch,
	db_startBatchProcessing,
	db_pauseBatchProcessing,
	db_resumeBatchProcessing,
	db_checkCreditsOnly,
	db_deductCreditsForActualBatch,
	db_createBatchWithEstimate,
	db_sendBatchCompletionEmail,
	db_checkDuplicateFilename
}
