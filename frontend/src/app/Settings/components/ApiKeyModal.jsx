// Dependencies
import { useState } from "react";

// Style Imports
import styles from "../Settings.module.css";

// Icon Imports
import {
	COMPLETE_CHECK_ICON,
} from "../../../assets/icons";

// Modal Component
export default function ApiKeyModal({
	apiKey,
	onClose,
}) {
	// States
  	const [copySuccess, setCopySuccess] = useState(false);

	// Helper Functions
	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(apiKey);
			setCopySuccess(true);
			setTimeout(() => {
				setCopySuccess(false);
			}, 3000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	// Render
  	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<h2 className={styles.modalTitle}>Your API Key</h2>
				<p className={styles.modalDescription}>
					Save this API key securely. You won't be able to see it again.
				</p>
				<div className={styles.apiKeyDisplay}>
					{apiKey}
				</div>
				<div className={styles.modalActions}>
					<button
						onClick={onClose}
						className={styles.closeButton}
					>
						Close
					</button>
					<button 
						onClick={handleCopy}
						className={`${styles.copyButton} ${copySuccess ? styles.copySuccess : ''}`}
					>
						{copySuccess && COMPLETE_CHECK_ICON}
						{copySuccess ? "Copied!" : "Copy"}
					</button>
				</div>
			</div>
		</div>
	);
}