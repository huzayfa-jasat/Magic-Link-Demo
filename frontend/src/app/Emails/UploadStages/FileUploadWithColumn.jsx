// Dependencies
import { useState, useCallback, useEffect } from 'react';

// Icon Imports
import { UPLOAD_ICON, COMPLETE_CHECK_ICON, EMAIL_ICON } from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

// Component Imports
import ColumnSelectorPopup from '../components/ColumnSelectorPopup';

// Component
export default function UploadStageFileUploadWithColumn({
	error,
	handleFileChange,
	file,
	fileData,
	handleColumnSelect,
	handleCancel,
}) {
	// States
	const [isDragging, setIsDragging] = useState(false);
	const [selectedColumnIndex, setSelectedColumnIndex] = useState(null);
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [sampleEmails, setSampleEmails] = useState([]);

	// Auto-select email column when fileData changes
	useEffect(() => {
		if (fileData && fileData.headers && fileData.headers.length > 0) {
			// Find first column that matches email variations (case-insensitive)
			const emailColumnIndex = fileData.headers.findIndex(header => {
				const lowerHeader = header.toLowerCase();
				return lowerHeader === 'email' || lowerHeader === 'email address';
			});
			
			if (emailColumnIndex !== -1) {
				setSelectedColumnIndex(emailColumnIndex);
			}
		}
	}, [fileData]);

	// Function to extract sample emails
	const updateSampleEmails = () => {
		if (selectedColumnIndex === null || !fileData || !fileData.rows || !fileData.rows.length) {
			setSampleEmails([]);
			return;
		}
		
		const validEmails = fileData.rows
			.slice(0, 10)
			.filter((row) => (
				row[selectedColumnIndex] !== undefined &&
				row[selectedColumnIndex] !== null &&
				row[selectedColumnIndex] !== '' &&
				// VERY simple email regex
				/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[selectedColumnIndex])
			))
			.map(row => row[selectedColumnIndex] || '-')
			.slice(0, 5);
			
		setSampleEmails(validEmails);
	};

	// Update sample emails when column selection changes
	useEffect(() => {
		updateSampleEmails();
	}, [selectedColumnIndex, fileData]);

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

	// Handle column selection from dropdown
	const handleDropdownColumnSelect = (index) => {
		setSelectedColumnIndex(index);
		setIsDropdownOpen(false);
	};

	// Handle continue button
	const handleContinue = () => {
		if (selectedColumnIndex !== null) {
			handleColumnSelect(selectedColumnIndex);
		}
	};


	// Render
	return (
		<>
			{(error) && <p className={styles.error}>{error}</p>}
			{!file ? (
				// File upload area
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
						Drag and drop your CSV or XLSX file here
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
			) : (
				// File uploaded with column selection
				<div className={styles.uploadWithColumnContainer}>
					{/* File upload area with checkmark */}
					<div
						className={`${styles.uploadArea} ${styles.uploadAreaComplete}`}
						onClick={() => document.getElementById('fileInput').click()}
					>
						<div className={styles.uploadIconComplete}>
							{COMPLETE_CHECK_ICON}
						</div>
						<p className={styles.uploadTextComplete}>
							{file.name}
						</p>
						<p className={styles.uploadSubtext}>
							Click to change file
						</p>
						<input
							id="fileInput"
							type="file"
							accept=".csv, .xlsx, .xls"
							onChange={handleFileChange}
							style={{ display: 'none' }}
						/>
					</div>

					{/* Column selection row */}
					<div className={styles.columnSelectRow}>
						<div className={styles.columnSelectIcon}>
							{EMAIL_ICON}
						</div>
						<div className={styles.columnSelectInfo}>
							<h3 className={styles.columnSelectTitle}>Select Email Column</h3>
							<p className={styles.columnSelectSubtitle}>
								Select the column that contains email addresses.
							</p>
						</div>
						<ColumnSelectorPopup
							isDropdownOpen={isDropdownOpen}
							setIsDropdownOpen={setIsDropdownOpen}
							selectedColumnIndex={selectedColumnIndex}
							headers={fileData.headers}
							handleDropdownColumnSelect={handleDropdownColumnSelect}
						/>
					</div>

					{/* Sample data display */}
					{selectedColumnIndex !== null && (
						<div className={styles.sampleDataContainer}>
							<h4 className={styles.sampleDataTitle}>Sample</h4>
							<div className={styles.sampleDataList}>
								{sampleEmails.length > 0 ? (
									sampleEmails.map((sample, index) => (
										<div key={index} className={styles.sampleDataItem}>
											{sample}
										</div>
									))
								) : (
									<div className={styles.emptySample}>
										No valid email samples found in the selected column.
									</div>
								)}
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className={styles.uploadButtonsContainer}>
						<button
							className={`${styles.uploadButtonSmall} ${styles.removeButton}`}
							onClick={handleCancel}
						>
							Cancel
						</button>
						<button
							className={`${styles.uploadButtonSmall} ${styles.continueButton}`}
							onClick={handleContinue}
							disabled={selectedColumnIndex === null}
						>
							Continue
						</button>
					</div>
				</div>
			)}
		</>
	)
}