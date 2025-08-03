// Dependencies
import Popup from "reactjs-popup";

// Icon Imports
import { EXPORT_ICON,
	EMAIL_ICON,
	VERIFY_VALID_ICON,
	VERIFY_INVALID_ICON,
	VERIFY_CATCHALL_ICON,
 } from "../../../assets/icons";

// Style Imports
import styles from "../styles/Emails.module.css";

// Component
export default function ExportPopupMenu({
	title,
	showExportPrefix=false,
	customButton=null,
	handleExport,
	showValid, showInvalid, showCatchall,
}) {
	return (		
		<Popup
			position="bottom right"
			arrow={false}
			on={["click"]}
			closeOnDocumentClick
			trigger={
				customButton ? customButton : (
					<button className={`${styles.button} ${styles.buttonPrimary}`}>
						{EXPORT_ICON}
						Export
					</button>
				)
			}
		>
			<div className={styles.exportMenu}>
				<button onClick={() => handleExport("all", title)}>
					{EMAIL_ICON}
					{(showExportPrefix) ? "Export All" : "All Emails"}
				</button>
				{(showValid > 0) && (
					<button className={styles.valid} onClick={() => handleExport("valid", title)}>
						{VERIFY_VALID_ICON}
						{(showExportPrefix) ? "Export Valid" : "Only Valid"}
					</button>
				)}
				{(showInvalid > 0) && (
					<button className={styles.invalid} onClick={() => handleExport("invalid", title)}>
						{VERIFY_INVALID_ICON}
						{(showExportPrefix) ? "Export Invalid" : "Only Invalid"}
					</button>
				)}
				{(showCatchall > 0) && (
					<button className={styles.catchall} onClick={() => handleExport("catch-all", title)}>
						{VERIFY_CATCHALL_ICON}
						{(showExportPrefix) ? "Export Catch-All" : "Only Catch-All"}
					</button>
				)}
			</div>
		</Popup>
	);
}