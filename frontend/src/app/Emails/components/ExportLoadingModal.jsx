// Dependencies
import React from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Helper Functions
const getProgressTitle = (status) => {
  if (status === 'error') {
    return 'Export Failed';
  } else if (status === 'starting') {
    return 'Preparing export...';
  }
};

const getProgressMessage = (status, message) => {
  if (status === 'error') {
    return 'There was an error exporting your data. Please try again.';
  } else if (message) {
    return message;
  } else if (status === 'starting') {
    return 'Preparing export...';
  } else if (status === 'processing') {
    return 'Processing data...';
  }
  return 'Please wait while we prepare your export.';
};

// Handle both old format (current/total) and new format (status/percentage/message)
const getProgressPercentage = (pct, current, total) => {
  if (pct !== undefined) return pct;
  else if (total > 0) return Math.round((current / total) * 100);
  return 0;
};


// Export Loading Modal Component
export default function ExportLoadingModal({ isOpen, progress }) {
  if (!isOpen) return null;

  const percentage = getProgressPercentage(progress.percentage, progress.current, progress.total);

  return (
    <div className={settingsStyles.modalOverlay}>
      <div className={settingsStyles.modal}>
        <h2 className={settingsStyles.modalTitle}>{getProgressTitle(progress.status)}</h2>
        <p className={settingsStyles.modalDescription}>
          {getProgressMessage(progress.status, progress.message)}
        </p>
        
        {/* Progress Bar */}
        <div className={settingsStyles.progressContainer}>
          <div className={settingsStyles.progressBar}>
            <div 
              className={settingsStyles.progressFill}
              style={{
                width: `${percentage}%`
              }} 
            />
          </div>
          <div className={settingsStyles.progressText}>
            {percentage > 0 ? `${percentage}%` : 'Loading...'}
          </div>
        </div>
      </div>
    </div>
  );
}