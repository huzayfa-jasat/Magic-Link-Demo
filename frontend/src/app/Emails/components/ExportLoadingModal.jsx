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
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'var(--bg-light)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
              height: '100%',
              backgroundColor: 'var(--main-hl)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{
            marginTop: '8px',
            fontSize: '14px',
            color: 'var(--txt-light)',
            textAlign: 'center'
          }}>
            {progress.total > 0 ? (
              `Processing page ${progress.current} of ${progress.total}`
            ) : (
              'Initializing...'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}