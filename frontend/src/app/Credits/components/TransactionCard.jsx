// Style Imports
import styles from "../styles/Credits.module.css";

// Icon Imports
import { COINS_ICON, EMAIL_ICON, GIFT_ICON } from "../../../assets/icons";

// Helper Functions
function getEventIcon(event_typ) {
	switch (event_typ) {
	case 'purchase':
		return COINS_ICON;
	case 'usage':
		return EMAIL_ICON;
	case 'refer_reward':
		return GIFT_ICON;
	case 'signup':
		return GIFT_ICON;
	}
}
function getEventTitle(event_typ, list_name = null, type = 'regular') {
	switch (event_typ) {
	case 'usage':
		if (type === 'catchall') {
			return list_name || 'Verified Catchalls';
		}
		return list_name || 'Verified Emails';
	case 'refer_reward':
		return 'Referral Reward';
	case 'signup':
		return 'Signup Bonus';
	default:
		return 'Purchase';
	}
}
function formatTransactionDate(date) {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

// Transaction Card component
export default function TransactionCard({
	transaction,
}) {
	// Render
	return (
		<div className={styles.history_card}>
			<div className={styles.history_card_left}>
				<div className={styles.history_card_icon}>
					{getEventIcon(transaction.event_typ)}
				</div>
				<div className={styles.history_card_title}>
					<h5>{getEventTitle(transaction.event_typ, transaction.list_name, transaction.type)}</h5>
					<p>{formatTransactionDate(transaction.usage_ts)}</p>
				</div>
			</div>
			<div className={`${styles.credits_used} ${(transaction.event_typ === 'usage') ? styles.negative : ''}`}>
				{(transaction.event_typ === 'usage') ? '-' : '+'}&nbsp;
				{Math.abs(transaction.credits_used).toLocaleString()} Credits
			</div>
		</div>
	);
}