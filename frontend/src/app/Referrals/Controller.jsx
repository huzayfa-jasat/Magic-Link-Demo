// Dependencies
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// API Imports
import { getReferralInviteCode, getReferralInviteList } from "../../api/credits";

// Style Imports
import styles from "./Referrals.module.css";

// Icon Imports
import { COMPLETE_CHECK_ICON, GIFT_ICON, WALLET_ICON } from "../../assets/icons";

// Helper Functions
function formatTransactionDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Helper Component
function ReferralCard({ referral }) {
  const isPending = referral.status === 'pending';
  // Render
  return (
    <div className={`${styles.history_card} ${isPending ? styles.pending_card : ''}`}>
      <div className={styles.history_card_left}>
        <div className={styles.history_card_icon}>
          {GIFT_ICON}
        </div>
        <div className={styles.history_card_title}>
          <h5>{referral.email}</h5>
          <p>{formatTransactionDate(referral.joined_ts)}</p>
          {isPending && <span className={styles.pending_badge}>Pending</span>}
        </div>
      </div>
      <div className={`${styles.credits_used} ${isPending ? styles.pending_credits : ''}`}>
        +&nbsp;{referral.credits.toLocaleString()}
      </div>
    </div>
  );
}

// Functional Component
export default function ReferralsController() {
  const navigate = useNavigate();
  
  // Data states
  const [referralCode, setReferralCode] = useState(null);
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralHistory, setReferralHistory] = useState([]);
  const [pendingReferrals, setPendingReferrals] = useState([]);
  const [userEligible, setUserEligible] = useState(false);
  const [userLifetimePurchases, setUserLifetimePurchases] = useState(0);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Fetch referral code
  const fetchReferralCode = async () => {
    try {
      const response = await getReferralInviteCode();
      setReferralCode(response.data.data);
      return true;
    } catch (err) {
      console.error("Error fetching transactions:", err);
      return false;
    }
  };
  useEffect(() => {
    fetchReferralCode();
  }, []);

  // Fetch referral history
  const fetchReferralHistory = async () => {
    const response = await getReferralInviteList();
    setReferralInfo({
      num_referrals: response.data.data.num_referrals,
      total_referral_credits: response.data.data.total_referral_credits,
      num_pending_referrals: response.data.data.num_pending_referrals,
      total_pending_credits: response.data.data.total_pending_credits,
    });
    setReferralHistory(response.data.data.referred_users || []);
    setPendingReferrals(response.data.data.pending_referrals || []);
    setUserEligible(response.data.data.user_eligible);
    setUserLifetimePurchases(response.data.data.user_lifetime_purchases);
  };
  useEffect(() => {
    fetchReferralHistory();
  }, []);

  // Sort transactions by date descending
  function sortByDateDescending(data) {
    return [...data].sort(
      (a, b) =>
        new Date(b.joined_ts) - new Date(a.joined_ts)
    );
  }
  const sortedReferralHistory = useMemo(
    () => sortByDateDescending([...referralHistory, ...pendingReferrals]),
    [referralHistory, pendingReferrals]
  );

  // Wrappers
  const handleShare = async () => {
    try {
      const share_link = `https://app.omniverifier.com/invite?code=${referralCode}`;
      await navigator.clipboard.writeText(share_link);
      setShareSuccess(true);
      setTimeout(() => {
        setShareSuccess(false);
      }, 5000);
    } catch (err) {
      console.error("Failed to copy share link:", err);
    }
  }

  // Render
  return (
    <div className={styles.container}>
      {/* Referral Code */}
      <h1 className={styles.title}>Referrals</h1>
      <br />
      
      {/* Eligibility Notice */}
      {!userEligible && (
        <div className={styles.eligibilityNotice}>
          <div className={styles.noticeIcon}>{WALLET_ICON}</div>
          <div className={styles.noticeContent}>
            <h3>Referral Rewards Eligibility</h3>
            <p>Both you and your referrals must purchase at least 100,000 credits to be eligible for referral bonuses.</p>
            <p>You've purchased {userLifetimePurchases.toLocaleString()} credits so far. You need {(100000 - userLifetimePurchases).toLocaleString()} more credits to unlock your referral rewards.</p>
            <button onClick={() => navigate('/purchase')} className={styles.purchaseButton}>
              Purchase Credits
            </button>
          </div>
        </div>
      )}
      <br />
      
      <div className={styles.metricsContainer}>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Referral Code</h2>
          <div className={styles.availableCredits}>
            {(referralCode !== null) && (referralCode)}
          </div>
          <div className={styles.referralActions}>
            <button onClick={handleShare} className={(shareSuccess) ? styles.copySuccess : ""}>
              {shareSuccess && COMPLETE_CHECK_ICON}
              {shareSuccess ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Total Referrals</h2>
          <div className={`${styles.availableCredits} ${styles.mini}`}>
            {(referralInfo !== null) && (
              referralInfo.num_referrals + referralInfo.num_pending_referrals
            )}
          </div>
          {referralInfo && referralInfo.num_pending_referrals > 0 && (
            <p className={styles.pendingCount}>{referralInfo.num_pending_referrals} pending</p>
          )}
        </div>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Total Rewards</h2>
          <div className={`${styles.availableCredits} ${styles.mini}`}>
            {(referralInfo !== null) && (referralInfo.total_referral_credits.toLocaleString())}
          </div>
          {referralInfo && referralInfo.total_pending_credits > 0 && (
            <p className={styles.pendingCount}>
              +{referralInfo.total_pending_credits.toLocaleString()} pending
            </p>
          )}
        </div>
      </div>
      <br /><br /><br />
      {/* Referral History */}
      {(referralHistory !== null && referralHistory.length > 0) && (
        <>
          <h1 className={styles.title}>Activity</h1>
          <br />
          <div className={styles.history_list}>
            {sortedReferralHistory.map((r) => (
              <ReferralCard key={`rf-${r.id}`} referral={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}