// Style Imports
import styles from '../Emails.module.css';

// Icons
import { VERIFY_VALID_ICON, VERIFY_INVALID_ICON, VERIFY_CATCHALL_ICON } from '../../../assets/icons';

// Component
export default function DetailStats({
	valid,
	invalid,
	catchall,
}) {
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
				{valid}
			</div>
		</div>
		<div className={styles.metaCard}>
			<div className={styles.metaLabel}>Invalid</div>
			<div className={`${styles.metaValue} ${styles.resultInvalid}`}>
				{VERIFY_INVALID_ICON}
				{invalid}
			</div>
		</div>
		<div className={styles.metaCard}>
			<div className={styles.metaLabel}>Catch-All</div>
			<div className={`${styles.metaValue} ${styles.resultCatchAll}`}>
				{VERIFY_CATCHALL_ICON}
				{catchall}
			</div>
		</div>
	</div>
  )
}