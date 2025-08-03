// Dependencies
import { NavLink } from "react-router-dom";

// Icon Imports
import { WALLET_ICON } from "../../../assets/icons";

// Style Imports
import styles from "../Referrals.module.css";

// Component
export default function ReferralEligibilityNotice({
	purchases,
}) {
	return (
		<div className={styles.eligibilityNotice}>
			<div className={styles.noticeContent}>
				<div className={styles.noticeHeader}>
					<div className={styles.noticeIcon}>{WALLET_ICON}</div>
					<h3>Unlock Rewards</h3>
				</div>
				<p>
					Both you and your referrals must purchase at least 100k credits to be eligible for referral bonuses. <span>You've purchased {purchases.toLocaleString()} credits so far. You need {(100000 - purchases).toLocaleString()} more credits to unlock your referral rewards.</span>
				</p>
				<NavLink to="/packages" className={styles.referralActionsButton}>Buy Credits</NavLink>
			</div>
		</div>
	)
}