// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const { resend_sendBatchCompletionEmail } = require('../../external_apis/resend.js');
const {
	getCreditTableName, getCreditHistoryTableName, getBatchTableName, getResultsTableName, getEmailBatchAssociationTableName, getBouncerBatchTableName,
	getBouncerEmailTableName,
	formatResultsByCheckType,
	createBatchBaseQuery, applyBatchStatusFilter, applyBatchResultFilter,
} = require('./funs_db_utils.js');
const { s3_triggerS3Enrichment } = require('./funs_s3.js');
const db_s3_funcs = require('./funs_db_s3.js');


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
	if (err_code || existing_batch.length === 0) console.log("/add ERR 1 = ", err_code);
	if (err_code || existing_batch.length === 0) return [false, null];

	// Add batch emails association table entries
	await knex(email_batch_association_table).insert(emails.map((email)=>({
		'batch_id': batch_id,
		'email_global_id': email.global_id,
		'email_nominal': email.email,
	}))).onConflict().merge().catch((err)=>{if (err) err_code = err.code});
	if (err_code) console.log("/add ERR 2 = ", err_code);
	if (err_code) return [false, null];

	// Update total email count
	await knex(batch_table).where({
		'id': batch_id
	}).update({
		'total_emails': existing_batch[0].total_emails + emails.length
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) console.log("/add ERR 3 = ", err_code);
	if (err_code) return [false, null];

	// Check cached results for existing results
	const existing_results = await knex(results_table).whereIn(
		'email_global_id', emails.map((email)=>email.global_id)
	).pluck(
		'email_global_id'
	).catch((err)=>{if (err) err_code = err.code});
	if (err_code) console.log("/add ERR 4 = ", err_code);
	if (err_code) return [false, null];

	// Update batch emails association table entries with cached results
	await knex(email_batch_association_table).whereIn(
		'email_global_id', existing_results
	).where('batch_id', batch_id).update({
		'used_cached': 1,
		'did_complete': 1,
	}).catch((err)=>{if (err) err_code = err.code});
	if (err_code) console.log("/add ERR 5 = ", err_code);
	if (err_code) return [false, null];

	return [true, batch_id];
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
	if (err_code || !global_emails) {
		console.log("EMAIL GLOBAL IDS ERR = ", err_code);
		return [false, null];
	}

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
			status_filter = ['processing', 'pending'];
			break;
		case 'queued':
			status_filter = ['queued'];
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
			// Everything except draft
			status_filter = ['queued', 'processing', 'pending', 'paused', 'completed', 'failed'];
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
	// - Return status as-is (no masking)
	// - Add progress for deliverable batches that are processing
	const formatted_batches = await Promise.all(batches.map(async (batch) => {
		const formatted = {
			...batch,
			status: batch.status
		};
		
		// Add progress for any processing batch
		if (formatted.status === 'processing') {
			// Determine batch type from the batch row itself
			// When category='all', batch.category is set from the query
			// Otherwise, we need to infer it from the category parameter
			const batch_typ = batch.category || category;
			
			// Get progress (using already-retrieved total # of emails in batch)
			const [progress_ok, progress_dict] = await db_getBatchProgress(user_id, batch.id, batch_typ, batch.emails);
			if (!progress_ok) return {
				...formatted,
				progress: 0,
			};
			formatted.progress = progress_dict.progress;

			// Mask <=5 progress as queued
			if (formatted.progress <= 5) formatted.status = 'queued';
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
	const stats = await knex(results_table).join(
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
	).first().catch((err)=>{if (err) err_code = err});
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

async function db_getCatchallBatchStats(batch_id) {
	let err_code;

	// Get table names
	const results_table = getResultsTableName('catchall');
	const email_batch_association_table = getEmailBatchAssociationTableName('catchall');
	if (!results_table || !email_batch_association_table) return [false, null];

	// Get stats
	const stats = await knex(results_table).join(
		email_batch_association_table,
		`${email_batch_association_table}.email_global_id`,
		`${results_table}.email_global_id`
	).where({
		[`${email_batch_association_table}.batch_id`]: batch_id,
		[`${email_batch_association_table}.did_complete`]: 1,
	}).select(
		knex.raw(`SUM(CASE WHEN ${results_table}.status = 'deliverable' THEN 1 ELSE 0 END) as valid`),
		knex.raw(`SUM(CASE WHEN ${results_table}.status = 'risky' THEN 1 ELSE 0 END) as risky`),
		knex.raw(`SUM(CASE WHEN ${results_table}.status = 'undeliverable' THEN 1 ELSE 0 END) as invalid`)
	).first().catch((err)=>{if (err) err_code = err});
	if (err_code || !stats) {
		console.log("CATCHALL BATCH STATS ERR = ", err_code);
		return [false, null];
	}
	
	// Return
	return [true, {
		good: stats.valid ?? 0,
		risky: stats.risky ?? 0,
		bad: stats.invalid ?? 0,
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
	// - Return status as-is (no masking)
	let batch_details = {
		...batch[0],
		status: batch[0].status
	}

	// If batch is not completed, return
	if (batch[0].status !== 'completed') return [true, batch_details];

	// If batch is completed, get stats
	let stats_ok, stats_dict;
	if (check_type === 'deliverable') {
		// Get stats
		[stats_ok, stats_dict] = await db_getDeliverableBatchStats(batch_id);
		if (!stats_ok) return [false, null];
		batch_details.stats = stats_dict;

	} else if (check_type === 'catchall') {
		// Get stats
		[stats_ok, stats_dict] = await db_getCatchallBatchStats(batch_id);
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
			results_columns = ['email_nominal', 'status', 'reason', 'score', 'provider', 'updated_ts'];
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
		// case 'scorehl': case 'scorelh':
		// 	if (check_type === 'deliverable') return [false, null]; // Enforce catchall-only sort
		// 	order_column = 'toxicity';
		// 	order_direction = (order === 'scorehl') ? 'desc' : 'asc';
		// 	break;
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
	base_query = applyBatchResultFilter(base_query, results_table, filter);

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
	count_query = applyBatchResultFilter(count_query, results_table, filter);

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

async function db_getBatchProgress(user_id, batch_id, checkType, total_emails=-1) {
	let err_code;
	
	// Get batch table names
	const batch_table = getBatchTableName(checkType);
	const email_batch_association_table = getEmailBatchAssociationTableName(checkType);
	const bouncer_batch_table = getBouncerBatchTableName(checkType);
	if (!batch_table || !email_batch_association_table || !bouncer_batch_table) return [false, null];

	// Get batch details first to ensure it exists and user has access
	// - Skip if # of total emails already provided
	let batch_resp;
	if (total_emails < 0) {
		batch_resp = await knex(batch_table)
			.where({
				'id': batch_id,
				'user_id': user_id
			})
			.select('id', 'total_emails', 'cached_results', 'status')
			.first()
			.catch((err)=>{if (err) err_code = err.code});
		if (err_code || !batch_resp) return [false, null];
	
		// Return status for completed, paused, or failed batches
		if (batch_resp.status === 'completed' || batch_resp.status === 'paused' || batch_resp.status === 'failed') {
			return [true, {
				status: batch_resp.status
			}];
		}
	} else {
		// If given, use total emails provided
		batch_resp = { total_emails };
	}

	// Get batch progress
	let batch_progress_dict = {
		status: 'processing',
		progress: 0,
	}

	// 1. Count already completed emails
	const completed_result = await knex(email_batch_association_table).where({
		'batch_id': batch_id,
		'did_complete': 1
	}).count('* as completed_count').first().catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [true, batch_progress_dict];
	
	// 2. Count in-progress emails from bouncer batches
	const bouncer_result = await knex(bouncer_batch_table).where({
		'user_batch_id': batch_id,
	}).whereIn('status', [
		'pending', 'processing'
	]).sum('processed as total_processed').first().catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [true, batch_progress_dict];
	
	// 3. Calculate progress percentage
	const completed_count = parseInt(completed_result.completed_count) || 0;
	const bouncer_processed = parseInt(bouncer_result.total_processed) || 0;
	const total_processed = completed_count + bouncer_processed;
	const percent_progress = (batch_resp.total_emails > 0)
		? Math.round((total_processed / batch_resp.total_emails) * 100)
		: 0;
	
	// Return
	console.log("BOUNCER PROCESSED = ", bouncer_processed);
	batch_progress_dict.progress = Math.min(percent_progress, 99); // Cap at 99% until batch is marked completed
	return [true, batch_progress_dict];
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
		// 1. Check subscription credits (if not expired)
		const subTable = check_type === 'catchall' ? 
			'User_Catchall_Sub_Credits' : 'User_Deliverable_Sub_Credits';
		
		const subCredits = await knex(subTable)
			.where({ user_id: user_id })
			.where('expiry_ts', '>', knex.fn.now())
			.select('credits_left')
			.first();
		
		const subAvailable = subCredits?.credits_left || 0;
		
		// 2. Check one-off credits
		const oneOffCredits = await knex(credit_table)
			.where({ 'user_id': user_id })
			.select('current_balance')
			.first();
		
		const oneOffAvailable = oneOffCredits?.current_balance || 0;
		
		// 3. Total available
		const totalAvailable = subAvailable + oneOffAvailable;
		
		// Verify sufficient balance
		if (totalAvailable < num_emails) {
			return [false, null];
		}

		// Return success with total available balance
		return [true, totalAvailable];

	} catch (error) {
		console.error('Credit check failed:', error.message);
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
			
			// 1. Lock and check subscription credits
			const subTable = check_type === 'catchall' ? 
				'User_Catchall_Sub_Credits' : 'User_Deliverable_Sub_Credits';
			
			const subCredits = await trx(subTable)
				.where({ user_id: user_id })
				.where('expiry_ts', '>', knex.fn.now())
				.forUpdate()
				.first();
			
			let remainingToDeduct = actual_email_count;
			let usedFromSub = 0;
			
			// 2. Use subscription credits first
			if (subCredits && subCredits.credits_left > 0) {
				usedFromSub = Math.min(subCredits.credits_left, remainingToDeduct);
				await trx(subTable)
					.where({ user_id: user_id })
					.update({ 
						credits_left: subCredits.credits_left - usedFromSub,
						updated_ts: knex.fn.now()
					});
				remainingToDeduct -= usedFromSub;
			}
			
			// 3. Lock and check one-off credits
			const oneOffCredits = await trx(credit_table)
				.where({ 'user_id': user_id })
				.select('current_balance')
				.forUpdate()
				.first();
			
			// 4. Verify sufficient total balance
			const oneOffAvailable = oneOffCredits?.current_balance || 0;
			if (remainingToDeduct > oneOffAvailable) {
				console.log("Err 2: Insufficient credits");
				throw new Error('Insufficient credits for actual batch size');
			}
			
			// 5. Use one-off credits for remainder
			let usedFromOneOff = 0;
			if (remainingToDeduct > 0) {
				await trx(credit_table)
					.where({ 'user_id': user_id })
					.decrement('current_balance', remainingToDeduct);
				usedFromOneOff = remainingToDeduct;
			}
			
			// 6. Log usage in history with breakdown
			if (actual_email_count > 0) {
				await trx(credit_history_table).insert({
					'user_id': user_id,
					'credits_used': actual_email_count,
					'event_typ': 'usage',
					'usage_ts': knex.fn.now()
				});
			}
			
			// 7. Calculate new total balance
			const newSubBalance = (subCredits?.credits_left || 0) - usedFromSub;
			const newOneOffBalance = oneOffAvailable - usedFromOneOff;
			const newTotalBalance = newSubBalance + newOneOffBalance;
			
			console.log(`Credit usage breakdown - Subscription: ${usedFromSub}, One-off: ${usedFromOneOff}`);

			// Return success with new balance and actual email count
			return [true, newTotalBalance, actual_email_count];
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
	if (err_code) {
		console.log("ERR CODE = ", err_code);
		return false;
	}

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
	// + trigger S3 enrichment
	if (is_completed) {
		await db_sendBatchCompletionEmail(user_id, check_type, batch_id);
		// Don't await - let it run in background
		s3_triggerS3Enrichment(batch_id, check_type, db_s3_funcs)
			.then(() => {
				console.log(`✅ S3 enrichment completed for batch ${batch_id}`);
			})
			.catch((error) => {
				console.error(`❌ S3 enrichment failed for batch ${batch_id}:`, error);
			});
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

async function db_deleteBatchCompletely(user_id, check_type, batch_id) {
    // Get table names
    const batch_table = getBatchTableName(check_type);
    const email_batch_association_table = getEmailBatchAssociationTableName(check_type);
    const bouncer_batch_table = getBouncerBatchTableName(check_type);
    const bouncer_email_table = getBouncerEmailTableName(check_type);
    
    if (!batch_table || !email_batch_association_table || !bouncer_batch_table || !bouncer_email_table) {
        console.error('Missing table names for batch deletion');
        return false;
    }
    
    let err_code;
    
    // Use transaction for atomic operations
    const trx = await knex.transaction();
    try {
        // 1. Delete bouncer email associations first (foreign key dependencies)
        await trx(bouncer_email_table)
            .whereIn('bouncer_batch_id', function() {
                this.select('bouncer_batch_id')
                    .from(bouncer_batch_table)
                    .where('user_batch_id', batch_id);
            })
            .del()
            .catch((err) => { if (err) err_code = err.code });
        if (err_code) {
            console.error('Error deleting bouncer emails:', err_code);
            await trx.rollback();
            return false;
        }
        
        // 2. Delete bouncer batches
        await trx(bouncer_batch_table)
            .where('user_batch_id', batch_id)
            .del()
            .catch((err) => { if (err) err_code = err.code });
        if (err_code) {
            console.error('Error deleting bouncer batches:', err_code);
            await trx.rollback();
            return false;
        }
        
        // 3. Delete email associations
        await trx(email_batch_association_table)
            .where('batch_id', batch_id)
            .del()
            .catch((err) => { if (err) err_code = err.code });
        if (err_code) {
            console.error('Error deleting email associations:', err_code);
            await trx.rollback();
            return false;
        }
        
        // 4. Finally delete the main batch record
        const deleted_count = await trx(batch_table)
            .where({
                'id': batch_id,
                'user_id': user_id,
            })
            .del()
            .catch((err) => { if (err) err_code = err.code });
        if (err_code) {
            console.error('Error deleting main batch:', err_code);
            await trx.rollback();
            return false;
        }
        
        if (deleted_count === 0) {
            console.error('Batch not found or access denied');
            await trx.rollback();
            return false;
        }
        
        // Commit transaction
        await trx.commit();
        
        console.log(`Successfully deleted batch ${batch_id} (${check_type}) for user ${user_id}`);
        return true;
        
    } catch (error) {
        await trx.rollback();
        console.error(`Failed to delete batch ${batch_id}:`, error.message);
        return false;
    }
}

// Get count of catchall emails from deliverable batch
async function db_getCatchallCountFromDeliverable(user_id, deliverable_batch_id) {
	try {
		// First verify the batch belongs to the user and is completed
		const batch = await knex('Batches_Deliverable')
			.where('id', deliverable_batch_id)
			.where('user_id', user_id)
			.where('status', 'completed')
			.first();
		
		if (!batch) {
			console.log('Batch not found or not completed for user');
			return [false, 0];
		}
		
		// Now just call the existing stats function and return the catchall count
		const [stats_ok, stats] = await db_getDeliverableBatchStats(deliverable_batch_id);
		
		if (!stats_ok) {
			console.error('Failed to get batch stats');
			return [false, 0];
		}
		
		const catchall_count = stats.catchall || 0;
		console.log("CATCHALL COUNT = ", catchall_count);
		return [true, catchall_count];

	} catch (error) {
		console.error('Error getting catchall count:', error);
		return [false, 0];
	}
}

// Create catchall batch from deliverable batch catchall results
async function db_createCatchallBatchFromDeliverable(user_id, deliverable_batch_id) {
	const trx = await knex.transaction();
	
	try {
		// 1. Get the original deliverable batch details
		const original_batch = await trx('Batches_Deliverable')
			.where('id', deliverable_batch_id)
			.where('user_id', user_id)
			.where('status', 'completed')
			.first();
			
		if (!original_batch) {
			await trx.rollback();
			console.log('Original deliverable batch not found or not completed');
			return null;
		}
		
		// 2. Get all catchall emails from the deliverable batch
		const catchall_emails = await trx('Batch_Emails_Deliverable as bed')
			.join('Email_Deliverable_Results as edr', 'bed.email_global_id', 'edr.email_global_id')
			.where('bed.batch_id', deliverable_batch_id)
			.where(function() {
				this.where('edr.is_catchall', 1)
					.orWhere(function() {
						this.where('edr.status', 'risky')
							.andWhere('edr.reason', 'low_deliverability');
					});
			})
			.select('bed.email_global_id', 'bed.email_nominal');
			
		if (catchall_emails.length === 0) {
			await trx.rollback();
			console.log('No catchall emails found in deliverable batch');
			return null;
		}
		
		// 3. Create new catchall batch
		const [new_batch_id] = await trx('Batches_Catchall').insert({
			'title': original_batch.title || 'Catchall Verification',
			'user_id': user_id,
			'status': 'queued',
			'total_emails': catchall_emails.length,
			'created_ts': knex.fn.now()
		});
		
		// 4. Copy S3 metadata if exists (use catchall_only export as original file)
		if (original_batch.s3_metadata) {
			// Check if s3_metadata is already an object or needs parsing
			const metadata = typeof original_batch.s3_metadata === 'string' 
				? JSON.parse(original_batch.s3_metadata) 
				: original_batch.s3_metadata;
			
			// Check if catchall_only export exists
			if (metadata.exports && metadata.exports.catchall_only) {
				const new_metadata = {
					original: {
						s3_key: metadata.exports.catchall_only.s3_key,
						mime_type: 'text/csv',
						column_mapping: metadata.original ? metadata.original.column_mapping : { email: 0 },
						source_batch_id: deliverable_batch_id
					}
				};
				
				await trx('Batches_Catchall')
					.where('id', new_batch_id)
					.update({
						's3_metadata': JSON.stringify(new_metadata)
					});
			} else if (metadata.original) {
				// Fallback to original file if no catchall export
				const new_metadata = {
					original: {
						...metadata.original,
						source_batch_id: deliverable_batch_id
					}
				};
				
				await trx('Batches_Catchall')
					.where('id', new_batch_id)
					.update({
						's3_metadata': JSON.stringify(new_metadata)
					});
			}
		}
		
		// 5. Add emails to the new catchall batch
		const batch_emails = catchall_emails.map(email => ({
			'batch_id': new_batch_id,
			'email_global_id': email.email_global_id,
			'email_nominal': email.email_nominal,
			'used_cached': 0,
			'did_complete': 0
		}));
		
		await trx('Batch_Emails_Catchall').insert(batch_emails);
		
		// 6. Check cached results for existing results
		const existing_results = await trx('Email_Catchall_Results')
			.whereIn('email_global_id', catchall_emails.map(email => email.email_global_id))
			.pluck('email_global_id');
		
		// 7. Update batch emails association table entries with cached results
		if (existing_results.length > 0) {
			await trx('Batch_Emails_Catchall')
				.whereIn('email_global_id', existing_results)
				.where('batch_id', new_batch_id)
				.update({
					'used_cached': 1,
					'did_complete': 1
				});
		}
		
		// 8. Check if all emails were cached - if so, mark batch as completed
		let batch_status = 'queued';  // Start as queued, will be set to processing or completed
		if (existing_results.length === catchall_emails.length) {
			batch_status = 'completed';
			console.log(`All ${catchall_emails.length} emails for catchall batch ${new_batch_id} were found in cache - marking as completed`);
		} else {
			console.log(`Found ${existing_results.length} cached results out of ${catchall_emails.length} emails for catchall batch ${new_batch_id}`);
		}
		
		// 9. Update batch status (either queued or completed)
		const status_update = batch_status === 'completed' 
			? { 'status': 'completed', 'completed_ts': knex.fn.now() }
			: { 'status': 'queued' };
			
		await trx('Batches_Catchall')
			.where('id', new_batch_id)
			.update(status_update);
		
		// Commit transaction
		await trx.commit();
		
		// 10. If batch is completed (all cached), send completion email and trigger S3 enrichment
		if (batch_status === 'completed') {
			await db_sendBatchCompletionEmail(user_id, 'catchall', new_batch_id);
			// Don't await - let it run in background
			s3_triggerS3Enrichment(new_batch_id, 'catchall', db_s3_funcs)
				.then(() => {
					console.log(`✅ S3 enrichment completed for catchall batch ${new_batch_id}`);
				})
				.catch((error) => {
					console.error(`❌ S3 enrichment failed for catchall batch ${new_batch_id}:`, error);
				});
		}
		
		console.log(`Created catchall batch ${new_batch_id} with ${catchall_emails.length} emails from deliverable batch ${deliverable_batch_id}`);
		return new_batch_id;
		
	} catch (error) {
		await trx.rollback();
		console.error('Error creating catchall batch from deliverable:', error);
		return null;
	}
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
	db_checkDuplicateFilename,
	db_deleteBatchCompletely,
	db_getCatchallCountFromDeliverable,
	db_createCatchallBatchFromDeliverable
}
