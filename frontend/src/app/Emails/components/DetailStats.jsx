// Icons
import {
	VERIFY_VALID_ICON,
	VERIFY_INVALID_ICON,
	VERIFY_CATCHALL_ICON
} from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

// Component
export default function DetailStats({
	valid,
	invalid,
	catchall,
}) {
	const valid_count = parseInt(valid) || 0;
	const invalid_count = parseInt(invalid) || 0;
	const catchall_count = parseInt(catchall) || 0;
	return (
		<div className={styles.detailsMeta}>
			{/* <div className={styles.metaCard}>
			<div className={styles.metaLabel}>Total Emails</div>
			<div className={styles.metaValue}>{details.emails}</div>
			</div> */}
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>Valid</div>
				<div className={`${styles.metaValue} ${styles.resultValid}`}>
					{VERIFY_VALID_ICON}
					{valid_count.toLocaleString()}
				</div>
			</div>
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>Invalid</div>
				<div className={`${styles.metaValue} ${styles.resultInvalid}`}>
					{VERIFY_INVALID_ICON}
					{invalid_count.toLocaleString()}
				</div>
			</div>
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>Catch-All</div>
				<div className={`${styles.metaValue} ${styles.resultCatchAll}`}>
					{VERIFY_CATCHALL_ICON}
					{catchall_count.toLocaleString()}
				</div>
			</div>
		</div>
  	)
}