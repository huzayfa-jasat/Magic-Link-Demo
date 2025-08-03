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

	// Get score "category" (just match up with colors from resutls map)
	let score_category;
	if (score === 'good') score_category = 1;
	else if (score === 'risky') score_category = 2;
	else if (score === 'bad') score_category = 0;
	else score_category = 4;
	
	// Return
	return (
		<div className={`${styles.tableCellResult} ${RESULT_DISPLAY_MAP[score_category].className}`}>
			{RESULT_DISPLAY_MAP[score_category].icon}
			{score}
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