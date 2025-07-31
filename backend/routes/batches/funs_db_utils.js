// Helper Functions

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

// Export
module.exports = {
	getCreditTableName,
	getCreditHistoryTableName,
	getBatchTableName,
	getResultsTableName,
	getBouncerBatchTableName,
	getBouncerEmailTableName,
	getEmailBatchAssociationTableName
}