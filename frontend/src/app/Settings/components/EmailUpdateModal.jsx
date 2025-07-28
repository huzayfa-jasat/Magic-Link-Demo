// Dependencies
import { useState } from "react";

// Style Imports
import styles from "../Settings.module.css";

// API Imports
import {
	updateProfileEmail,
} from "../../../api/settings.js";

// Modal Component
export default function EmailUpdateModal({
	onSuccess,
	onClose,
}) {
	// States
	const [newEmail, setNewEmail] = useState("");
	const [confirmEmail, setConfirmEmail] = useState("");
	const [emailError, setEmailError] = useState("");
	const [emailSuccess, setEmailSuccess] = useState(false);

	// Wrapper Functions
	const handleEmailUpdate = async () => {
		// Clear previous errors
		setEmailError("");
		setEmailSuccess(false);

		// Validation
		if (!newEmail || !confirmEmail) {
			setEmailError("Please fill in both email fields");
			return;
		}

		if (newEmail !== confirmEmail) {
			setEmailError("Email addresses do not match");
			return;
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(newEmail)) {
			setEmailError("Please enter a valid email address");
			return;
		}

		// Update email
		try {
			const response = await updateProfileEmail(newEmail);
			if (response.status === 200) {
				setEmailSuccess(true);
				setEmailError("");
				
				// Update the displayed email
				onSuccess(newEmail);

				// Clear form after 2 seconds
				setTimeout(() => {
					setNewEmail("");
					setConfirmEmail("");
					setEmailSuccess(false);
					onClose();
				}, 2000);
			}
		} catch (err) {
			setEmailError("Failed to update email. Please try again.");
			console.error("Email update error:", err);
		}
	};

	// Render
  	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<h2 className={styles.modalTitle}>Update Email</h2>
				<p className={styles.modalDescription}>
					Enter your new email address below.
				</p>
				<div className={styles.passwordForm}>
					{(emailError) && (
						<div className={styles.errorMessage}>
							{emailError}
						</div>
					)}
					{(emailSuccess) && (
						<div className={styles.successMessage}>
							Email updated successfully!
						</div>
					)}
					<input
						type="email"
						placeholder="New Email"
						value={newEmail}
						onChange={(e) => setNewEmail(e.target.value)}
						className={styles.passwordInput}
					/>
					<input
						type="email"
						placeholder="Confirm New Email"
						value={confirmEmail}
						onChange={(e) => setConfirmEmail(e.target.value)}
						className={styles.passwordInput}
					/>
				</div>
				<div className={styles.modalActions}>
					<button
						onClick={onClose}
						className={styles.closeButton}
					>
						Cancel
					</button>
					<button 
						onClick={handleEmailUpdate} 
						className={styles.copyButton}
						disabled={emailSuccess}
					>
						{(emailSuccess) ? "Done!" : "Update Email"}
					</button>
				</div>
			</div>
		</div>
	);
}