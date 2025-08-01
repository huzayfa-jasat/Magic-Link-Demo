// Dependencies
import React from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Export Loading Modal Component
export default function ExportLoadingModal({ isOpen, progress }) {
  if (!isOpen) return null;

  return (
    <div className={settingsStyles.modalOverlay}>
      <div className={settingsStyles.modal}>
        <h2 className={settingsStyles.modalTitle}>Downloading...</h2>
        <p className={settingsStyles.modalDescription}>
          Please wait while we prepare your export...
        </p>
        
        {/* Progress Bar */}
        <div className={settingsStyles.progressContainer}>
          <div className={settingsStyles.progressBar}>
            <div 
              className={settingsStyles.progressFill}
              style={{
                width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%'
              }} 
            />
          </div>
          <div className={settingsStyles.progressText}>
            {progress.total > 0 ? (
              `Processing page ${progress.current} of ${progress.total}`
            ) : (
              'Loading...'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}