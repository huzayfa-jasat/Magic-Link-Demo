// Dependencies
import React, { useState, useEffect } from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Processing Modal Component
export default function ProcessingModal({ isOpen, batch, requests, onClose }) {
  const [currentProgress, setCurrentProgress] = useState(0);
  
  // Update progress when batch changes or requests update
  useEffect(() => {
    if (!batch) return;
    
    // Find the current batch in requests to get latest progress
    const currentBatch = requests.find(r => r.id === batch.id && r.category === batch.category);
    if (currentBatch) {
      setCurrentProgress(currentBatch.progress || 0);
    } else {
      // Use initial batch progress if not found in requests
      setCurrentProgress(batch.progress || 0);
    }
  }, [batch, requests]);
  
  if (!isOpen || !batch) return null;

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
                width: `${currentProgress}%`
              }} 
            />
          </div>
          <div className={settingsStyles.progressText}>
            {`${currentProgress}% complete`}
          </div>
        </div>
      </div>
    </div>
  );
}