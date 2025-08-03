// Dependencies
import { useMemo, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";

// Component Imports
import ExportPopupMenu from "./ExportPopupMenu";
import ProcessingPopupMenu from "./ProcessingPopupMenu";
import ExportLoadingModal from "./ExportLoadingModal";

// API Imports
import { 
	pauseVerifyBatchProcessing, 
	pauseCatchallBatchProcessing,
	resumeVerifyBatchProcessing,
	resumeCatchallBatchProcessing,
} from "../../../api/batches";

// Context Imports
import { ErrorContext } from "../../../ui/Context/ErrorContext";

// Utility Imports
import { exportBatchToCSV } from "../../../utils/exportBatch";

// Icon Imports
import {
  DOTS_ICON,
  EMAIL_ICON, EMAIL_SHREDDER_ICON,
  COMPLETE_CHECK_ICON, PROCESSING_ICON, FAILED_ICON, PAUSE_ICON,
} from "../../../assets/icons";

// Style Imports
import styles from "../styles/Emails.module.css";

// Helper Functions
function getValidateTypeDisplay(category) {
	// Get name
	let category_name;
	switch (category) {
		case 'deliverable':
			category_name = 'Email Validation';
			break;
		case 'catchall':
			category_name = 'Catchall Validation';
			break;
	}
	
	// Get icon
	let category_icon;
	switch (category) {
		case 'deliverable':
			category_icon = EMAIL_ICON;
			break;
		case 'catchall':
			category_icon = EMAIL_SHREDDER_ICON;
			break;
	}

	// Return
	return (
		<div className={styles.statusContainer}>
			{category_icon}
			<p>{category_name}</p>
		</div>
	)
}
function getStatusDisplay(status, progress=0) {
	// Get status name
	let status_name;
	switch (status) {
		case 'completed': case 'complete':
			status_name = 'Complete';
			break;
		case 'processing':
			status_name = `In Progress (${progress}%)`;
			break;
		case 'paused':
			status_name = 'Paused';
			break;
		case 'failed':
			status_name = 'Failed';
			break;
		default:
			return <></>;
	}

	// Get status icon
	let status_icon;
	switch (status) {
		case 'completed': case 'complete':
			status_icon = COMPLETE_CHECK_ICON;
			break;
		case 'processing':
			status_icon = PROCESSING_ICON;
			break;
		case 'paused':
			status_icon = PAUSE_ICON;
			break;
		case 'failed':
			status_icon = FAILED_ICON;
			break;
		default:
			return <></>;
	}

	// Return
	return (
		<div className={`${styles.metaValue} ${styles[status]}`}>
			{status_icon}
			<p className={styles.statusText}>{status_name}</p>
		</div>
	)
}
function getEmailCountDisplay(count) {
	return <span className={styles.statValue}>{count.toLocaleString()}</span>;
}

// Component
export default function BatchCard({
	request,
	onBatchPause,
	onBatchResume,
	onProcessingClick,
	onRemoveClick,
}) {
	const navigate = useNavigate();
	const errorContext = useContext(ErrorContext);
	
	// Export loading state
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
	
	// Construct details link
	const details_link = useMemo(
		() => `/${(request.category === 'deliverable') ? 'verify' : 'catchall'}/${request.id}/details`,
		[request.id, request.category]
	);
	
	// Check batch status
	const isCompleted = request.status === 'completed' || request.status === 'complete';
	const isProcessing = request.status === 'processing';
	const isPaused = request.status === 'paused';
	
	// Handle click for processing batches
	const handleClick = () => {
		if (isCompleted) navigate(details_link);
		else if ((isProcessing || isPaused) && onProcessingClick) onProcessingClick(request);
	};

	// Handle pause
	const handlePause = async (requestId) => {
		try {
			let resp;
			if (request.category === 'deliverable') resp = await pauseVerifyBatchProcessing(requestId);
			else if (request.category === 'catchall') resp = await pauseCatchallBatchProcessing(requestId);
			
			// Handle response
			if (resp.status === 200) onBatchPause(requestId, request.category);
			else errorContext.showError(1);

		} catch (error) {
			console.error('Failed to pause batch:', error);
		}
	};

	// Handle resume
	const handleResume = async (requestId) => {
		try {
			let resp;
			if (request.category === 'deliverable') resp = await resumeVerifyBatchProcessing(requestId);
			else if (request.category === 'catchall') resp = await resumeCatchallBatchProcessing(requestId);

			// Handle response
			if (resp.status === 200) onBatchResume(requestId, request.category);
			else errorContext.showError(1);

		} catch (error) {
			console.error('Failed to resume batch:', error);
		}
	};

	// Handle remove
	const handleRemove = (requestId) => {
		onRemoveClick(requestId, request.category);
	};

	// Handle export
	const handleExport = async (type, title) => {
		setIsExporting(true);
		setExportProgress({ current: 0, total: 0 });
		
		try {
			// Determine checkTyp based on category
			const checkTyp = request.category === 'deliverable' ? 'verify' : 'catchall';
			
			await exportBatchToCSV({
				batchId: request.id,
				checkTyp,
				filter: type,
				title: title || request.title,
				onProgress: setExportProgress
			});
		} catch (error) {
			console.error('Export failed:', error);
		} finally {
			setIsExporting(false);
		}
	};
	
	// Render
	const cardContent = (
		<div className={styles.card}>
			{(isCompleted) &&
				<ExportPopupMenu
					title={request.title} showExportPrefix={true}
					showValid={true} showInvalid={true} showCatchall={true}
					handleExport={handleExport}
					customButton={
						<button className={styles.cardButton}>
							{DOTS_ICON}
						</button>
					}
				/>
			}
			{(isProcessing || isPaused) &&
				<ProcessingPopupMenu
					requestId={request.id}
					isPaused={isPaused}
					handlePause={handlePause}
					handleResume={handleResume}
					handleRemove={handleRemove}
					customButton={
						<div className={styles.cardButton}>
							{DOTS_ICON}
						</div>
					}
				/>
			}
			<div className={styles.cardHeader}>
				<div className={styles.cardSubtitle}>
					{request.title || `New Request`}
				</div>
				{getValidateTypeDisplay(request.category)}
			</div>
			<div className={styles.stats}>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Emails</span>
					{getEmailCountDisplay(request.emails)}
				</div>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Status</span>
					{getStatusDisplay(request.status, request.progress)}
				</div>
			</div>
		</div>
	);

	// Return clickable if completed/processing/paused, otherwise just the card
	return (
		<>
			{(isCompleted || isProcessing || isPaused) ? (
				<div
					key={request.id}
					onClick={handleClick}
					className={styles.link}
					style={{ cursor: 'pointer' }}
				>
					{cardContent}
				</div>
			) : (
				<div key={request.id} className={styles.link} style={{ cursor: 'default' }}>
					{cardContent}
				</div>
			)}
			<ExportLoadingModal
				isOpen={isExporting}
				progress={exportProgress}
			/>
		</>
	);
}