// Dependencies
import React from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Duplicate File Modal Component
export default function DuplicateFileModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className={settingsStyles.modalOverlay} onClick={onClose}>
      <div className={settingsStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={settingsStyles.modalTitle}>Duplicate file detected</h2>
        <p className={settingsStyles.modalDescription}>
          Are you sure you want to proceed? You've already uploaded a list with the same name.
        </p>
        
        {/* Buttons */}
        <div className={settingsStyles.modalActions}>
          <button className={settingsStyles.closeButton} onClick={onClose}>Cancel</button>
          <button className={settingsStyles.removeButton} onClick={onConfirm}>Yes, proceed</button>
        </div>
      </div>
    </div>
  );
}