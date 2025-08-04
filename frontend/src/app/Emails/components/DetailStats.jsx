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
	checkTyp,
	valid, invalid, catchall,
	good, risky, bad,
}) {
	const valid_count = (checkTyp === 'verify') ? parseInt(valid) : parseInt(good);
	const invalid_count = (checkTyp === 'verify') ? parseInt(invalid) : parseInt(risky);
	const catchall_count = (checkTyp === 'verify') ? parseInt(catchall) : parseInt(bad);
	return (
		<div className={styles.detailsMeta}>
			{/* <div className={styles.metaCard}>
			<div className={styles.metaLabel}>Total Emails</div>
			<div className={styles.metaValue}>{details.emails}</div>
			</div> */}
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>{(checkTyp === 'catchall') ? 'Good' : 'Valid'}</div>
				<div className={`${styles.metaValue} ${styles.resultValid}`}>
					{VERIFY_VALID_ICON}
					{valid_count.toLocaleString()}
				</div>
			</div>
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>{(checkTyp === 'catchall') ? 'Risky' : 'Catch-All'}</div>
				<div className={`${styles.metaValue} ${styles.resultCatchAll}`}>
					{VERIFY_CATCHALL_ICON}
					{catchall_count.toLocaleString()}
				</div>
			</div>
			<div className={styles.metaCard}>
				<div className={styles.metaLabel}>{(checkTyp === 'catchall') ? 'Bad' : 'Invalid'}</div>
				<div className={`${styles.metaValue} ${styles.resultInvalid}`}>
					{VERIFY_INVALID_ICON}
					{invalid_count.toLocaleString()}
				</div>
			</div>
		</div>
  	)
}