// Icon Imports
import { EMAIL_ICON, EMAIL_SHREDDER_ICON } from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

// Component
export default function UploadStageFinalize({
	emailCount,
	handleVerifyUpload,
	handleCatchallUpload,
}) {
	// Render
	return (
        <div className={styles.finalizeContainer}>
          <div className={styles.finalizeRow}>
            <div className={styles.finalizeHeader}>
              <div className={styles.finalizeIcon}>
                {EMAIL_ICON}
              </div>
              <h2 className={styles.subtitle}>Email Validation</h2>
            </div>
            <p className={styles.finalizeText}>
              Test if emails are valid, invalid, or potential catch-alls.
            </p>
            <button className={styles.finalizeButton} onClick={handleVerifyUpload}>
              Validate {emailCount} Emails
            </button>
          </div>
          <div className={styles.finalizeRow}>
            <div className={styles.finalizeHeader}>
              <div className={styles.finalizeIcon}>
                {EMAIL_SHREDDER_ICON}
              </div>
              <h2 className={styles.subtitle}>Catchall Validation</h2>
            </div>
            <p className={styles.finalizeText}>
              Test the deliverability of catchall emails.
            </p>
            <button className={styles.finalizeButton} onClick={handleCatchallUpload}>
              Validate {emailCount} Catchalls
            </button>
          </div>
        </div>
	)
}