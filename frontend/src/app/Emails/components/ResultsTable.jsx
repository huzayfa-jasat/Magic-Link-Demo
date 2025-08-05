// Component Imports
import getMailServerDisplay from "../utils/getMailServerDisplay";

// Icon Imports
import {
	VERIFY_VALID_ICON,
	VERIFY_INVALID_ICON,
	VERIFY_CATCHALL_ICON,
	VERIFY_UNKNOWN_ICON,
} from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

// Constants
const RESULT_DISPLAY_MAP = {
	0: {
		text: "Invalid",
		icon: VERIFY_INVALID_ICON,
		className: styles.resultInvalid,
	},
	1: {
		text: "Valid",
		icon: VERIFY_VALID_ICON,
		className: styles.resultValid,
	},
	2: {
		text: "Catch-All",
		icon: VERIFY_CATCHALL_ICON,
		className: styles.resultCatchAll,
	},
	4: {
		text: "Unknown",
		icon: VERIFY_UNKNOWN_ICON,
		className: styles.resultUnknown,
	}
}

// Helper Functions
const getResultDisplay = (result) => {
	if (!RESULT_DISPLAY_MAP[result]) return <></>;

	// Return
	return (
		<div className={`${styles.tableCellResult} ${RESULT_DISPLAY_MAP[result].className}`}>
			{RESULT_DISPLAY_MAP[result].icon}
			{RESULT_DISPLAY_MAP[result].text}
		</div>
	);
}
const getCatchallDisplay = (result) => {
	if (result === undefined || result === null) return <></>;

	// Get score text and category (match category with colors from results map)
	let result_category;
	let result_text;
	switch (result.status) {
		case 1:
			result_category = 1;
			result_text = "Good";
			break;
		case 2:
			result_category = 2;
			result_text = "Risky";
			break;
		case 0:
			result_category = 0;
			result_text = "Bad";
			break;
		default:
			result_category = 4;
			result_text = "Unknown";
			break;
	}

	// Return
	return (
		<div className={`${styles.tableCellResult} ${RESULT_DISPLAY_MAP[result_category].className}`}>
			{RESULT_DISPLAY_MAP[result_category].icon}
			{result_text}
		</div>
	)
}

// Component
export default function ResultsTable({
	typ,
	results,
}) {
	// Render
	return (
		<table className={styles.table}>
			<thead className={styles.tableHeader}>
				<tr>
					<th className={styles.tableHeaderCell}>Email</th>
					{(typ === 'verify') && (<>
						<th className={styles.tableHeaderCell}>Status</th>
						<th className={styles.tableHeaderCell}>Mail Server</th>
					</>)}
					{(typ === 'catchall') && (
						<th className={styles.tableHeaderCell}>Deliverability</th>
					)}
				</tr>
			</thead>
			<tbody>
				{results.map((item, index) => {
					return (
						<tr key={index} className={styles.tableRow}>
							<td className={styles.tableCell}>
								{item.email}
							</td>
							{(typ === 'verify') && (<>
								<td className={`${styles.tableCell} ${styles.tableCellResult}`}>
									{getResultDisplay(item.result)}
								</td>
								<td className={styles.tableCell}>
									{getMailServerDisplay(item.provider)}
								</td>
							</>)}
							{(typ === 'catchall') && (
								<td className={`${styles.tableCell} ${styles.tableCellResult}`}>
									{getCatchallDisplay(item.result)}
								</td>
							)}
						</tr>
					);
				})}
			</tbody>
		</table>
	)
}