// Style Imports
import styles from '../styles/Emails.module.css';

// Component
export default function UploadStageColumnSelect({
	fileName,
	headers,
	sampleData,
	handleColumnSelect,
	handleCancel,
}) {
	// Render
	return (
		<div className={styles.columnSelectContainer}>
			<div className={styles.columnSelectHeader}>
				<h2 className={styles.subtitle}>{fileName}</h2>
				<p className={styles.columnSelectText}>
					Select the column containing email addresses.
				</p>
			</div>
			<div className={styles.columnGrid}>
				{headers.map((_, index) => (
					<button
						key={index}
						className={styles.columnButton}
						onClick={() => handleColumnSelect(index)}
					>
						<div className={styles.columnHeader}>
							Column {index + 1}
						</div>
						<div className={styles.columnSamples}>
							{/* Show header row first */}
							<div className={styles.columnSample}>
								{headers[index] || '-'}
							</div>
							{/* Then show sample data rows */}
							{sampleData.slice(0, 3).map((row, rowIndex) => (
								<div key={rowIndex} className={styles.columnSample}>
									{row[index] || '-'}
								</div>
							))}
						</div>
					</button>
				))}
			</div>
			<div className={styles.uploadButtonsContainer}>
				<button
					className={`${styles.uploadButtonSmall} ${styles.removeButton}`}
					onClick={handleCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	)
}