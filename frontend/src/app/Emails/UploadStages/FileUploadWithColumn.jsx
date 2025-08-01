// Dependencies
import { useState, useCallback, useEffect } from 'react';
import Popup from 'reactjs-popup';

// Icon Imports
import { UPLOAD_ICON, COMPLETE_CHECK_ICON } from '../../../assets/icons';

// Style Imports
import styles from '../styles/Emails.module.css';

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

	// Auto-select email column when fileData changes
	useEffect(() => {
		if (fileData && fileData.headers && fileData.headers.length > 0) {
			// Find first column that exactly matches "Email" or "Email Address"
			const emailColumnIndex = fileData.headers.findIndex(header => 
				header === 'Email' || header === 'Email Address'
			);
			
			if (emailColumnIndex !== -1) {
				setSelectedColumnIndex(emailColumnIndex);
			}
		}
	}, [fileData]);

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

	// Get sample data for selected column
	const getSampleData = () => {
		if (selectedColumnIndex === null || !fileData.rows.length) return [];
		
		return fileData.rows.slice(0, 3).map(row => row[selectedColumnIndex] || '-');
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
						<div className={styles.columnSelectInfo}>
							<h3 className={styles.columnSelectTitle}>Email Column</h3>
							<p className={styles.columnSelectSubtitle}>
								Select the column containing email addresses
							</p>
						</div>
						
						<Popup
							position="bottom right"
							arrow={false}
							on={["click"]}
							closeOnDocumentClick
							open={isDropdownOpen}
							onOpen={() => setIsDropdownOpen(true)}
							onClose={() => setIsDropdownOpen(false)}
							trigger={
								<button className={styles.columnDropdownTrigger}>
									{selectedColumnIndex !== null 
										? (fileData.headers[selectedColumnIndex] || `Column ${selectedColumnIndex + 1}`)
										: 'Select column'}
									<span className={styles.dropdownArrow}>▼</span>
								</button>
							}
							contentStyle={{
								boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								padding: '8px',
								background: 'white',
								maxHeight: '300px',
								overflowY: 'auto',
								minWidth: '200px'
							}}
						>
							<div className={styles.columnDropdownContent}>
								{fileData.headers.map((header, index) => (
									<button
										key={index}
										className={styles.columnDropdownItem}
										onClick={() => handleDropdownColumnSelect(index)}
									>
										<div className={styles.columnDropdownItemHeader}>
											{header || `Column ${index + 1}`}
										</div>
										<div className={styles.columnDropdownItemSample}>
											{fileData.rows[0]?.[index] || '-'}
										</div>
									</button>
								))}
							</div>
						</Popup>
					</div>

					{/* Sample data display */}
					{selectedColumnIndex !== null && (
						<div className={styles.sampleDataContainer}>
							<h4 className={styles.sampleDataTitle}>Sample data:</h4>
							<div className={styles.sampleDataList}>
								{getSampleData().map((sample, index) => (
									<div key={index} className={styles.sampleDataItem}>
										{sample}
									</div>
								))}
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