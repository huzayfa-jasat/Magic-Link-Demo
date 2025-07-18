// Icon Imports
import { GIFT_ICON } from "../../../assets/icons";

// Style Imports
import styles from "../styles/Packages.module.css";

// Functional Component
export default function PackageCard({
	name, amount, price, bonus, total,
	handleClick
}) {
  return (
	<div className={styles.creditCard}>
		<h1 className={styles.packageName}>{name}</h1>
		<h2 className={styles.numCredits}>{amount}</h2>
		<p className={styles.verificationText}>Email Verification Credits</p>
		{(total) && (
			<div className={styles.bonusContainer}>
				<h4 className={styles.bonus}>Omni Bonus Promotion</h4>
				<div className={styles.extraCredits}>
					{GIFT_ICON}
					<span>+{bonus} = {total}</span>
				</div>
			</div>
		)}
		{/* <p className={styles.price}>Only {price} USD</p> */}
		<button
			className={`${styles.buyBtn} ${styles.premium}`}
			onClick={handleClick}
		>
			{/* Buy Credits */}
			Only {price} USD
		</button>
	</div>
  );
}