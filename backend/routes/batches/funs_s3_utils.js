function getExportTitle(checkType, exportType, batchTitle) {
	// Create file prefix
	const file_prefix = (checkType === 'deliverable') ? '' : 'Catchall_';

	// Create file middle
	let file_export_prefix = '';
	switch (exportType) {
		case 'all_emails':
			file_export_prefix = 'All_Emails';
			break;
		case 'valid_only':
			file_export_prefix = 'Valid_Only';
			break;
		case 'invalid_only':
			file_export_prefix = 'Invalid_Only';
			break;
		case 'catchall_only':
			file_export_prefix = 'Catchall_Only';
			break;
		case 'good_only':
			file_export_prefix = 'Good_Only';
			break;
		case 'bad_only':
			file_export_prefix = 'Bad_Only';
			break;
		case 'risky_only':
			file_export_prefix = 'Risky_Only';
			break;
		default:
			file_export_prefix = 'Unknown';
			break;
	}

	// Combine & return full export file name
	return `${file_prefix}${file_export_prefix}_OmniVerifier_${batchTitle}`;
}

// Export
module.exports = {
	getExportTitle
}