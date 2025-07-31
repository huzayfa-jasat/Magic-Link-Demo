// Icon Imports
import { EMAIL_ICON, TIME_ICON, MONEY_ICON } from "../../../assets/icons";

// Style Imports
import styles from "../styles/Emails.module.css";

// Helper Functions
function getTimeDisplayString(mins) {
	if (mins < 60) return `${mins} mins`;
	else if (mins < 1440) return `${Math.floor(mins / 60)} hours`;
	else return `${Math.floor(mins / 1440)} days`;
}
function getMoneyDisplayString(cost) {
	return `$${cost.toFixed(2).toLocaleString()}`;
}

// Component
export default function DashboardOverviewStats({
	stats
}) {
  return (
    <div className={styles.overviewStats}>
		<div className={styles.overviewStat}>
			<div className={styles.overviewStatHeader}>
				<div className={styles.overviewStatIcon}>
					{EMAIL_ICON}
				</div>
				<h2 className={styles.overviewStatTitle}>{stats.bounced.toLocaleString()} emails</h2>
			</div>
			<p className={styles.overviewStatText}>You protected yourself from sending {stats.bounced.toLocaleString()} bounced emails.</p>
		</div>
		<div className={styles.overviewStat}>
			<div className={styles.overviewStatHeader}>
				<div className={styles.overviewStatIcon}>
					{TIME_ICON}
				</div>
				<h2 className={styles.overviewStatTitle}>{getTimeDisplayString(stats.mins)}</h2>
			</div>
			<p className={styles.overviewStatText}>You've saved approximately {getTimeDisplayString(stats.mins)} on verifications compared to competitors.</p>
		</div>
		<div className={styles.overviewStat}>
			<div className={styles.overviewStatHeader}>
				<div className={styles.overviewStatIcon}>
					{MONEY_ICON}
				</div>
				<h2 className={styles.overviewStatTitle}>{getMoneyDisplayString(stats.cost)}</h2>
			</div>
			<p className={styles.overviewStatText}>You've saved approximately {getMoneyDisplayString(stats.cost)} on verifications compared to competitors.</p>
		</div>
    </div>
  );
}