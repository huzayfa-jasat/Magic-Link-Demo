// Dependencies
import { NavLink } from "react-router-dom";

// Style Imports
import styles from "../styles/Credits.module.css";

// Balance Card component
export default function BalanceCard({
	title="Balance",
	balance=0,
	oneOffBalance=null,
	subscriptionBalance=0,
	subscriptionExpiry=null,
	buttonText="Buy Credits",
	buttonLink="/packages",
}) {
	// Calculate days until expiry
	const daysUntilExpiry = subscriptionExpiry ? 
		Math.ceil((new Date(subscriptionExpiry) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

	// Render
	return (
		<div className={styles.balanceContainer}>
			<h2 className={styles.verificationText}>{title}</h2>
			<div className={styles.availableCredits}>
				{(balance !== null) && (balance.toLocaleString())}
			</div>
			
			{/* Show breakdown if subscription credits exist */}
			{subscriptionBalance > 0 && (
				<div className={styles.creditBreakdown}>
					<div className={styles.breakdownItem}>
						<span className={styles.breakdownLabel}>Monthly Credits:</span>
						<span className={styles.breakdownValue}>{subscriptionBalance.toLocaleString()}</span>
						{daysUntilExpiry > 0 && (
							<span className={styles.expiryNote}>Expires in {daysUntilExpiry} days</span>
						)}
					</div>
					<div className={styles.breakdownItem}>
						<span className={styles.breakdownLabel}>Purchased Credits:</span>
						<span className={styles.breakdownValue}>{(oneOffBalance || 0).toLocaleString()}</span>
					</div>
				</div>
			)}
			
			<NavLink to={buttonLink} className={styles.packagesButton}>
				{buttonText}
			</NavLink>
			
			{/* Add manage subscription link if they have an active subscription */}
			{subscriptionBalance > 0 && (
				<NavLink to="/packages?p=subscriptions" className={styles.manageSubLink}>
					Manage Subscription
				</NavLink>
			)}
		</div>
	);
}