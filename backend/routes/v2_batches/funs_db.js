// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Helper Functions
const getBatchTableName = (check_type) => {
	switch (check_type) {
		case 'deliverable':
			return 'Batches_Deliverable';
		case 'catchall':
			return 'Batches_Catchall';
		default:
			return null;
	}
}
const getResultsTableName = (check_type) => {
	switch (check_type) {
		case 'deliverable':
			return 'Email_Deliverable_Results';
		case 'catchall':
			return 'Email_Catchall_Results';
		default:
			return null;
	}
}
const getEmailBatchAssociationTableName = (check_type) => {
	switch (check_type) {
		case 'deliverable':
			return 'Batch_Emails_Deliverable';
		case 'catchall':
			return 'Batch_Emails_Catchall';
		default:
			return null;
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
	await knex(batch_table).insert({
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
		'used_cached': 0,
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

	// Create base query (handle table-level category filters)
	let base_query;
	switch (category) {
		case 'all':
			/*
			TODO: union of deliverable and catchall batch tables but with same filters, etc. applied to each.
			* And I want the sort to be applied to the union.
			* The metadata should also be from the union.
			* Each result should also have a "category" field added to it (it is not in the DB schema, we just need to know which table a given result came from)
			*/
			break;
		case 'deliverable':
			base_query = knex('Batches_Deliverable').where({
				'user_id': user_id,
				'is_archived': 0,
			});
			break;
		case 'catchall':
			base_query = knex('Batches_Catchall').where({
				'user_id': user_id,
				'is_archived': 0,
			});
			break;
		default:
			break;
	};

	// Handle column-level status filters
	// TODO: Also needs to work for the union of the two tables.
	switch (status) {
		case 'processing':
			base_query = base_query.whereIn('status', ['processing', 'queued']);
			break;
		case 'completed':
			base_query = base_query.whereIn('status', ['completed']);
			break;
		case 'failed':
			base_query = base_query.whereIn('status', ['failed']);
			break;
		default:
			break;
	}

	// Get batches list
	let err_code;
	const batches = await base_query.select(
		'id',
		'title',
		'status',
		'total_emails AS emails',
		'created_ts AS created',
		'completed_ts AS completed',
	)
	.limit(limit).offset((page-1)*limit) // Apply pagination
	.orderBy(order_column, order_direction) // Apply sorting
	.catch((err)=>{if (err) err_code = err.code});
	if (err_code) return [false, null];

	// Format batches list
	// - Mask "queued" as "processing"
	const formatted_batches = batches.map((batch)=>({
		...batch,
		status: (batch.status === 'queued') ? 'processing' : batch.status
	}));

	// TODO: Get metadata
	const metadata = {
		total_pages: 0,
		total_count: 0,
		has_more: false,
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
			results_columns = ['email_nominal', 'status', 'reason', 'is_catchall', 'score', 'updated_ts'];
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

	// TODO: Get metadata
	const metadata = {
		total_pages: 0,
		total_count: 0,
		has_more: false,
	}

	// Return results + metadata
	return [true, formatted_results, metadata];
}


// -------------------
// UPDATE Functions
// -------------------

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
	db_removeBatch
}