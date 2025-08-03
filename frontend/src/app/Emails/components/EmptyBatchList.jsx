// Dependencies
import { NavLink } from "react-router-dom";

// Icon Imports
import {
	EMAIL_QUESTION_ICON, UPLOAD_ICON
} from "../../../assets/icons";

// Style Imports
import styles from "../styles/Emails.module.css";

// Component
export default function EmptyBatchList() {
  return (
	<div className={styles.container}>
		<div className={styles.empty}>
			<div className={styles.emptyIcon}>
				{EMAIL_QUESTION_ICON}
			</div>
			<p className={styles.emptyText}>No lists found</p>
			<p className={styles.emptySubtext}>Start by validating some emails.</p>
			<NavLink to="/upload" className={styles.uploadButton}>
				{UPLOAD_ICON}
				Upload
			</NavLink>
		</div>
	</div>
  );
}