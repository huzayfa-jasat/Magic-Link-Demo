// Icon Imports
import { GIFT_ICON } from "../../../assets/icons";

// Style Imports
import styles from "../Referrals.module.css";

function formatTransactionDate(date) {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

// Component
export default function ReferralCard({
	referral
}) {
	const isPending = referral.status === 'pending';
	
	// Render
	return (
		<div className={`${styles.history_card} ${(isPending) ? styles.pending_card : ''}`}>
			<div className={styles.history_card_left}>
				<div className={styles.history_card_icon}>
					{GIFT_ICON}
				</div>
				<div className={styles.history_card_title}>
					<h5>Referred {referral.email}</h5>
					<p>{formatTransactionDate(referral.joined_ts)}</p>
					{(isPending) && <span className={styles.pending_badge}>Pending</span>}
				</div>
			</div>
			<div className={`${styles.credits_used} ${(isPending) ? styles.pending_credits : ''}`}>
				+&nbsp;{referral.credits.toLocaleString()}
			</div>
		</div>
	);
}