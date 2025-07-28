// Dependencies
import { useState, useCallback } from 'react';

// Icon Imports
import { UPLOAD_ICON } from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

// Component
export default function UploadStageFileUpload({
	error,
	handleFileChange,
}) {
	// States
	const [isDragging, setIsDragging] = useState(false);

	// Handle drag over
	const handleDragOver = useCallback((event) => {
		event.preventDefault();
		setIsDragging(true);
	}, []);

	// Handle drag leave
	const handleDragLeave = useCallback((event) => {
		event.preventDefault();
		setIsDragging(false);
	}, []);

	// Handle drop
	const handleDrop = useCallback((event) => {
		event.preventDefault();
		setIsDragging(false);
		
		const droppedFile = event.dataTransfer.files[0];
		if (!droppedFile) return;

		// Create a synthetic event to reuse the file change handler
		const syntheticEvent = {
			target: {
				files: [droppedFile]
			}
		};
		handleFileChange(syntheticEvent);
	}, [handleFileChange]);

	// Render
	return (
        <>
          {(error) && <p className={styles.error}>{error}</p>}
          <div
            className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <div className={styles.uploadIcon}>
              {UPLOAD_ICON}
            </div>
            <p className={styles.uploadText}>
              Drag and drop your CSV or Excel file here
            </p>
            <p className={styles.uploadSubtext}>
              or click to browse
            </p>
            <input
              id="fileInput"
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        </>
	)
}