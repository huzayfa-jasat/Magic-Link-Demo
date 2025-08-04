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
const getScoreDisplay = (score) => {
	if (score === undefined || score === null) return <></>;

	// Get score text and category (match category with colors from results map)
	let score_category;
	let score_text;
	switch (score) {
		case 'good':
			score_category = 1;
			score_text = "Good";
			break;
		case 'risky':
			score_category = 2;
			score_text = "Risky";
			break;
		case 'bad':
			score_category = 0;
			score_text = "Bad";
			break;
		default:
			score_category = 4;
			score_text = "Unknown";
			break;
	}

	// Return
	return (
		<div className={`${styles.tableCellResult} ${RESULT_DISPLAY_MAP[score_category].className}`}>
			{RESULT_DISPLAY_MAP[score_category].icon}
			{score_text}
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
									{getScoreDisplay(item.score)}
								</td>
							)}
						</tr>
					);
				})}
			</tbody>
		</table>
	)
}