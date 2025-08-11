// ------------------
// Helper Functions
// ------------------


// Table Name Functions

const getCreditTableName = (check_type) => {
	switch (check_type) {
		case 'deliverable':
			return 'Users_Credit_Balance';
		case 'catchall':
			return 'Users_Catchall_Credit_Balance';
	}
}
const getCreditHistoryTableName = (check_type) => {
	switch (check_type) {
		case 'deliverable':
			return 'Users_Credit_Balance_History';
		case 'catchall':
			return 'Users_Catchall_Credit_Balance_History';
	}
}
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
const getBouncerBatchTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Bouncer_Batches_Deliverable';
        case 'catchall':
            return 'Bouncer_Batches_Catchall';
        default:
            return null;
    }
}
const getBouncerEmailTableName = (check_type) => {
    switch (check_type) {
        case 'deliverable':
            return 'Bouncer_Batch_Emails_Deliverable';
        case 'catchall':
            return 'Bouncer_Batch_Emails_Catchall';
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

// Formatting Functions
const formatResultsByCheckType = (results, check_type) => {
	const results_no_unknown = results.filter((result)=>result.status !== 'unknown');
	return results_no_unknown.map((result)=>{
		let check_type_specific_result = {};

		// Handle check_type specific results
		switch (check_type) {
			case 'deliverable':
				// Handle "deliverable" type results (translate fields into "result")
				if (result.status === 'deliverable' && result.is_catchall === 0) check_type_specific_result.result = 1; // Mark as deliverable
				else if ((result.is_catchall === 1) || (result.status === 'risky' && result.reason === 'low_deliverability')) check_type_specific_result.result = 2; // Mark as "catch-all"
				else check_type_specific_result.result = 0; // Mark as undeliverable
				// Add provider
				check_type_specific_result.provider = result.provider;
				break;
			case 'catchall':
				// Handle "catchall" type results (translate fields into "result")
				if (result.status === 'deliverable') check_type_specific_result.result = 1; // Mark as deliverable
				else if (result.status === 'risky') check_type_specific_result.result = 2; // Mark as risky
				else check_type_specific_result.result = 0; // Mark as undeliverable
				// Add provider
				check_type_specific_result.provider = result.provider;
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

// Query Builder Functions
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
const applyBatchResultFilter = (query, results_table, filter) => {
	switch (filter) {
		case 'all':
			break;
		case 'deliverable':
			query = query.where({
				[`${results_table}.status`]: 'deliverable',
				[`${results_table}.is_catchall`]: 0,
			});
			break;
		case 'catchall':
			query = query.where(function() {
				this.where({
					[`${results_table}.status`]: 'risky',
					[`${results_table}.reason`]: 'low_deliverability',
				}).orWhere({
					[`${results_table}.is_catchall`]: 1,
				});
			});
			break;
		case 'undeliverable':
			query = query.whereNot(function () {
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
			query = query.where('status', 'deliverable');
			break;
		case 'risky':
			query = query.where('status', 'risky');
			break;
		case 'bad':
			query = query.where('status', 'undeliverable');
			break;
		default:
			break;
	}
	return query;
}


// Export
module.exports = {
	getCreditTableName,
	getCreditHistoryTableName,
	getBatchTableName,
	getResultsTableName,
	getBouncerBatchTableName,
	getBouncerEmailTableName,
	getEmailBatchAssociationTableName,
	formatResultsByCheckType,
	createBatchBaseQuery,
	applyBatchStatusFilter,
	applyBatchResultFilter,
}