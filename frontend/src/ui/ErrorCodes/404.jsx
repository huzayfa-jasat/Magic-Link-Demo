// Dependencies
import { NavLink } from "react-router-dom";

// Style Imports
import styles from "./404.module.css";

// Icon Imports
import { EMAIL_QUESTION_ICON } from "../../assets/icons";

// Component
export default function NotFoundPage() {
	// Render
	return (
		<>
			<div className={styles.container}>
				<div className={styles.content}>
					<div className={styles.icon}>
						{EMAIL_QUESTION_ICON}
					</div>
					<h1>We can't find that page!</h1>
					<p>The page you're looking for either doesn't exist, or has been moved.</p>
					<NavLink to="/validate" className={styles.button}>
						Back to Home
					</NavLink>
				</div>
			</div>
		</>
	);
}