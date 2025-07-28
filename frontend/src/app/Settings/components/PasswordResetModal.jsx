// Dependencies
import { useState } from "react";

// API Imports
import {
	updatePassword,
} from "../../../api/auth.js";

// Style Imports
import styles from "../Settings.module.css";

// Modal Component
export default function PasswordResetModal({
	onClose,
}) {
	// States
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState("");
	const [passwordSuccess, setPasswordSuccess] = useState(false);

	// Wrapper Functions
	const handlePasswordReset = async () => {
		// Clear previous errors
		setPasswordError("");
		setPasswordSuccess(false);

		// Validation
		if (!newPassword || !confirmPassword) {
			setPasswordError("Please fill in both password fields");
			return;
		}

		if (newPassword !== confirmPassword) {
			setPasswordError("Passwords do not match");
			return;
		}

		if (newPassword.length < 8) {
			setPasswordError("Password must be at least 8 characters long");
			return;
		}

		try {
			const response = await updatePassword(newPassword);
			if (response.status === 200) {
				setPasswordSuccess(true);
				setPasswordError("");
				// Clear form after 2 seconds
				setTimeout(() => {
					setNewPassword("");
					setConfirmPassword("");
					setPasswordSuccess(false);
					onClose();
				}, 2000);
			}
		} catch (err) {
			setPasswordError("Failed to update password. Please try again.");
			console.error("Password update error:", err);
		}
	};

	// Render
  	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<h2 className={styles.modalTitle}>Reset Password</h2>
				<p className={styles.modalDescription}>
					Enter your new password below.
				</p>
				<div className={styles.passwordForm}>
					{(passwordError) && (
						<div className={styles.errorMessage}>
						{passwordError}
						</div>
					)}
					{(passwordSuccess) && (
						<div className={styles.successMessage}>
							Password updated successfully!
						</div>
					)}
					<input
						type="password"
						placeholder="New password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						className={styles.passwordInput}
					/>
					<input
						type="password"
						placeholder="Confirm new password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						className={styles.passwordInput}
					/>
				</div>
				<div className={styles.modalActions}>
					<button onClick={onClose} className={styles.closeButton}>
						Cancel
					</button>
					<button 
						onClick={handlePasswordReset} 
						className={styles.copyButton}
						disabled={passwordSuccess}
					>
						{passwordSuccess ? "Done!" : "Update Password"}
					</button>
				</div>
			</div>
		</div>
	);
}