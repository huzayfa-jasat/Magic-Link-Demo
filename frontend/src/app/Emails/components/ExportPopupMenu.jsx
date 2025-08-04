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
	checkTyp,
	handleExport,
	showExportPrefix=false,
	customButton=null,
	showValid=1, showInvalid=1, showCatchall=1,
	showGood=1, showRisky=1, showBad=1,
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
				{(checkTyp === 'deliverable' || checkTyp === 'verify') && (<>
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
				</>)}
				{(checkTyp === 'catchall') && (<>
					{(showGood > 0) && (
						<button className={styles.valid} onClick={() => handleExport("good", title)}>
							{VERIFY_VALID_ICON}
							{(showExportPrefix) ? "Export Good" : "Only Good"}
						</button>
					)}
					{(showRisky > 0) && (
						<button className={styles.catchall} onClick={() => handleExport("risky", title)}>
							{VERIFY_CATCHALL_ICON}
							{(showExportPrefix) ? "Export Risky" : "Only Risky"}
						</button>
					)}
					{(showBad > 0) && (
						<button className={styles.invalid} onClick={() => handleExport("bad", title)}>
							{VERIFY_INVALID_ICON}
							{(showExportPrefix) ? "Export Bad" : "Only Bad"}
						</button>
					)}
				</>)}
			</div>
		</Popup>
	);
}