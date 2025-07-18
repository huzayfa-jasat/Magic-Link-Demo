// Dependencies
import { NavLink } from "react-router-dom";

// Style Imports
import styles from "../styles/Credits.module.css";

// Balance Card component
export default function BalanceCard({
	title="Balance",
	balance=0,
	buttonText="Buy Credits",
	buttonLink="/packages",
}) {
	// Render
	return (
		<div className={styles.balanceContainer}>
			<h2 className={styles.verificationText}>{title}</h2>
			<div className={styles.availableCredits}>
			{(balance !== null) && (balance.toLocaleString())}
			</div>
			<NavLink to={buttonLink} className={styles.packagesButton}>
				{buttonText}
			</NavLink>
		</div>
	);
}