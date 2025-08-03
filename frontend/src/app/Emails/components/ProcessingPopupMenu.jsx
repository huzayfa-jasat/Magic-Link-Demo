// Dependencies
import Popup from "reactjs-popup";

// Icon Imports
import {
	PAUSE_ICON,
	PLAY_ICON,
	VERIFY_INVALID_ICON,
 } from "../../../assets/icons";

// Style Imports
import styles from "../styles/Emails.module.css";

// Component
export default function ProcessingPopupMenu({
	requestId,
	isPaused=false,
	handlePause, handleResume, handleRemove,
	customButton=null,
}) {
	return (		
		<Popup
			position="bottom right"
			arrow={false}
			on={["click"]}
			closeOnDocumentClick
			trigger={customButton}
		>
			<div className={styles.exportMenu}>
				{isPaused ? (
					<button onClick={() => handleResume(requestId)}>
						{PLAY_ICON}
						Resume Validation
					</button>
				) : (
					<button onClick={() => handlePause(requestId)}>
						{PAUSE_ICON}
						Pause Validation
					</button>
				)}
				<button className={styles.invalid} onClick={() => handleRemove(requestId)}>
					{VERIFY_INVALID_ICON}
					Remove List
				</button>
			</div>
		</Popup>
	);
}