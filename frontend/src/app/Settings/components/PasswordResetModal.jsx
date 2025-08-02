// Dependencies
import { useState } from "react";

// API Imports
import {
	sendResetPasswordEmail,
} from "../../../api/auth.js";

// Style Imports
import styles from "../Settings.module.css";

// Modal Component
export default function PasswordResetModal({
	onClose,
	email,
}) {
	// States
	const [passwordError, setPasswordError] = useState("");
	const [passwordSuccess, setPasswordSuccess] = useState(false);

	// Wrapper Functions
	const handlePasswordReset = async () => {
		// Clear previous errors
		setPasswordError("");
		setPasswordSuccess(false);

		try {
			const response = await sendResetPasswordEmail();
			if (response.status === 200) {
				setPasswordSuccess(true);
				setPasswordError("");
			}
		} catch (err) {
			setPasswordError("Failed to send reset email. Please try again.");
			console.error("Password reset error:", err);
		}
	};

	// Render
  	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<h2 className={styles.modalTitle}>Reset Password</h2>
				{!passwordSuccess ? (
					<>
						<p className={styles.modalDescription}>
							We'll send a password reset link to:
						</p>
						<p className={styles.modalDescription} style={{ fontWeight: "bold", marginTop: "8px" }}>
							{email}
						</p>
					</>
				) : (
					<p className={styles.modalDescription}>
						Password reset instructions have been sent to your email!
					</p>
				)}
				<div className={styles.passwordForm}>
					{(passwordError) && (
						<div className={styles.errorMessage}>
						{passwordError}
						</div>
					)}
					{(passwordSuccess) && (
						<div className={styles.successMessage}>
							Check your email for password reset instructions!
						</div>
					)}
				</div>
				<div className={styles.modalActions}>
					<button onClick={onClose} className={styles.closeButton}>
						{passwordSuccess ? "Close" : "Cancel"}
					</button>
					{!passwordSuccess && (
						<button 
							onClick={handlePasswordReset} 
							className={styles.copyButton}
						>
							Send Reset Link
						</button>
					)}
				</div>
			</div>
		</div>
	);
}