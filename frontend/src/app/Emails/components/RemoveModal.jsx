// Dependencies
import React from "react";

// Style Imports
import settingsStyles from "../../Settings/Settings.module.css";

// Processing Modal Component
export default function RemoveModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className={settingsStyles.modalOverlay} onClick={onClose}>
      <div className={settingsStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={settingsStyles.modalTitle}>Are you sure?</h2>
        <p className={settingsStyles.modalDescription}>
          Are you sure you want to remove this list? This action cannot be undone. Any credits used for this list will not be refunded.
        </p>
        
        {/* Buttons */}
        <div className={settingsStyles.modalActions}>
          <button className={settingsStyles.closeButton} onClick={onClose}>Cancel</button>
          <button className={settingsStyles.removeButton} onClick={onConfirm}>Yes, remove the list</button>
        </div>
      </div>
    </div>
  );
}