// Style Imports
import styles from '../Emails.module.css';

// Icon Imports
import { EMAIL_ICON, EMAIL_SHREDDER_ICON } from '../../../assets/icons';

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
              <h2 className={styles.subtitle}>Verify Emails</h2>
            </div>
            <p className={styles.finalizeText}>
              Test if emails are valid, invalid, or potential catch-alls.
            </p>
            <button className={styles.finalizeButton} onClick={handleVerifyUpload}>
              Verify {emailCount} Emails
            </button>
          </div>
          <div className={styles.finalizeRow}>
            <div className={styles.finalizeHeader}>
              <div className={styles.finalizeIcon}>
                {EMAIL_SHREDDER_ICON}
              </div>
              <h2 className={styles.subtitle}>Test Catch-All's</h2>
            </div>
            <p className={styles.finalizeText}>
              Test the deliverability of emails to potential catch-all recipients.
            </p>
            <button className={styles.finalizeButton} onClick={handleCatchallUpload}>
              Test {emailCount} Emails
            </button>
          </div>
        </div>
	)
}