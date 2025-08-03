// Dependencies
import React from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Processing Modal Component
export default function ProcessingModal({ isOpen, progress, onClose }) {
  if (!isOpen) return null;

  return (
    <div className={settingsStyles.modalOverlay} onClick={onClose}>
      <div className={settingsStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={settingsStyles.modalTitle}>Processing...</h2>
        <p className={settingsStyles.modalDescription}>
          Your list is currently in progress.
        </p>
        
        {/* Progress Bar */}
        <div className={settingsStyles.progressContainer}>
          <div className={settingsStyles.progressBar}>
            <div 
              className={settingsStyles.progressFill}
              style={{
                width: `${progress}%`
              }} 
            />
          </div>
          <div className={settingsStyles.progressText}>
            {`${progress}% complete`}
          </div>
        </div>
      </div>
    </div>
  );
}