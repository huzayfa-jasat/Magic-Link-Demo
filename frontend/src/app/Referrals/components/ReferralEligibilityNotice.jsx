// Dependencies
import { useNavigate } from "react-router-dom";

// Icon Imports
import { WALLET_ICON } from "../../../assets/icons";

// Style Imports
import styles from "../Referrals.module.css";
import settingsStyles from "../../Settings/Settings.module.css";

// Duplicate File Modal Component
export default function ReferralEligibilityNotice({ purchases, onClose }) {
  const navigate = useNavigate();

  // Render
  return (
    <div className={settingsStyles.modalOverlay} onClick={onClose}>
      <div className={settingsStyles.modal} onClick={(e) => e.stopPropagation()}>
		<div className={styles.noticeIcon}>{WALLET_ICON}</div>
		<br/>
        <h2 className={settingsStyles.modalTitle}>Unlock Rewards</h2>
        <p className={settingsStyles.modalDescription}>
          Both you and your referrals must purchase at least 100k credits to be eligible for referral bonuses. <span>You've purchased {purchases.toLocaleString()} credits so far. You need {(100000 - purchases).toLocaleString()} more credits to unlock your referral rewards.</span>
        </p>
        
        {/* Buttons */}
        <div className={settingsStyles.modalActions}>
          <button className={settingsStyles.closeButton} onClick={onClose}>Close</button>
          <button className={`${settingsStyles.copyButton} ${settingsStyles.wide}`} onClick={()=>{navigate("/packages")}}>Buy Credits</button>
        </div>
      </div>
    </div>
  );
}