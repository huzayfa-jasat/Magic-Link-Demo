// Component Imports
import getMailServerDisplay from "../getMailServerDisplay";

// Icon Imports
import { VERIFY_VALID_ICON, VERIFY_INVALID_ICON, VERIFY_CATCHALL_ICON } from '../../../assets/icons';

// Style Imports
import styles from '../Emails.module.css';

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
					<th className={styles.tableHeaderCell}>Status</th>
					<th className={styles.tableHeaderCell}>Mail Server</th>
				</tr>
			</thead>
			<tbody>
				{results.map((item, index) => {
					return (
						<tr key={index} className={styles.tableRow}>
							<td className={styles.tableCell}>
								{item.email}
							</td>
							<td className={`${styles.tableCell} ${styles.tableCellResult}`}>
								{getResultDisplay(item.result)}
							</td>
							<td className={styles.tableCell}>
								{getMailServerDisplay(item.provider)}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	)
}