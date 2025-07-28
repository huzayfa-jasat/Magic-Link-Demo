// Dependencies
import { useNavigate } from 'react-router-dom';

// Style Imports
import styles from './CreditsModal.module.css';

// Icon Imports
import { FAILED_ICON } from '../../assets/icons';

// Component
export default function CreditsModal({ 
  isOpen, 
  onClose, 
  checkType = 'verify',
  message = 'Insufficient credits to process this batch.'
}) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleBuyCredits = () => {
    // Navigate to credits page with appropriate parameters
    const urlParam = checkType === 'verify' ? 'validate' : 'catchall';
    navigate(`/packages?p=${urlParam}`);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.icon}>
            {FAILED_ICON}
          </div>
          <h2 className={styles.title}>Insufficient Credits</h2>
        </div>
        
        <div className={styles.content}>
          <p className={styles.message}>{message}</p>
          <p className={styles.subtitle}>
            You need more {checkType === 'verify' ? 'email validation' : 'catchall validation'} credits to process this batch.
          </p>
        </div>
        
        <div className={styles.buttons}>
          <button className={styles.buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.buttonPrimary} onClick={handleBuyCredits}>
            Buy Credits
          </button>
        </div>
      </div>
    </div>
  );
}