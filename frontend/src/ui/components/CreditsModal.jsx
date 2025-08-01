// Dependencies
import { useNavigate } from 'react-router-dom';

// Style Imports
import styles from './CreditsModal.module.css';

// Icon Imports
import { WALLET_ICON } from '../../assets/icons';

// Component
export default function CreditsModal({ 
  isOpen, 
  onClose, 
  checkType = 'verify',
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
            {WALLET_ICON}
          </div>
          <h2 className={styles.title}>Not Enough Credits</h2>
        </div>
        
        <div className={styles.content}>
          <p className={styles.message}>You don't have enough credits to validate these emails.</p>
        </div>
        
        <div className={styles.buttons}>
          <button className={styles.buttonSecondary} onClick={onClose}>
            Close
          </button>
          <button className={styles.buttonPrimary} onClick={handleBuyCredits}>
            Buy More Credits
          </button>
        </div>
      </div>
    </div>
  );
}