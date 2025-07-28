// Dependencies
import { useMemo } from "react";
import { NavLink } from "react-router-dom";

// Icon Imports
import {
  EMAIL_ICON, EMAIL_SHREDDER_ICON,
  COMPLETE_CHECK_ICON, PROCESSING_ICON, FAILED_ICON,
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
function getStatusDisplay(status) {
	// Get status name
	let status_name;
	switch (status) {
		case 'completed': case 'complete':
			status_name = 'Complete';
			break;
		case 'processing': case 'queued':
			status_name = 'Processing';
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
		case 'processing': case 'queued':
			status_icon = PROCESSING_ICON;
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

// Component
export default function BatchCard({
	request
}) {
	// Construct details link
	const details_link = useMemo(
		() => `/${(request.category === 'deliverable') ? 'verify' : 'catchall'}/${request.id}/details`,
		[request.id, request.category]
	);
	
	// Check if batch is completed
	const isCompleted = request.status === 'completed' || request.status === 'complete';
	
	// Render
	const cardContent = (
		<div className={styles.card}>
			<div className={styles.cardHeader}>
				<div className={styles.subtitle}>
					{request.title || `New Request`}
				</div>
				{getValidateTypeDisplay(request.category)}
			</div>
			<div className={styles.stats}>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Emails</span>
					<span className={styles.statValue}>
						{request.emails}
					</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Status</span>
					{getStatusDisplay(request.status)}
				</div>
			</div>
		</div>
	);

	// Return clickable NavLink only if completed, otherwise just the card
	if (isCompleted) {
		return (
			<NavLink
				key={request.id}
				to={details_link}
				className={styles.link}
			>
				{cardContent}
			</NavLink>
		);
	} else {
		return (
			<div key={request.id} className={styles.link} style={{ cursor: 'default' }}>
				{cardContent}
			</div>
		);
	}
}