// Style Imports
import styles from '../styles/Emails.module.css';

// Component
export default function UploadStagePreview({
	fileName,
	emailCount,
	emailSlice,
	handleCancel,
	handleContinue,
}) {
	// Render
	return (		
        <div className={styles.previewContainer}>
          <div className={styles.previewHeader}>
            <h2 className={styles.subtitle}>{fileName}</h2>
            <span className={styles.previewCount}>
              {emailCount} {emailCount === 1 ? 'email' : 'emails'}
            </span>
          </div>
          <div className={styles.previewList}>
            {emailSlice.map((email, index) => (
              <div key={index} className={styles.previewItem}>
                {email}
              </div>
            ))}
            {(emailCount > emailSlice.length) && (
              <div className={styles.previewItem}>
                +{emailCount - emailSlice.length} more
              </div>
            )}
          </div>
          <div className={styles.uploadButtonsContainer}>
            <button
              className={`${styles.uploadButtonSmall} ${styles.removeButton}`}
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className={styles.uploadButtonSmall}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </div>		
	)
}