// Dependencies
import { useState, useEffect, useMemo } from "react";

// API Imports
import { getReferralInviteCode, getReferralInviteList } from "../../api/credits";

// Style Imports
import styles from "./Referrals.module.css";

// Icon Imports
import { GIFT_ICON } from "../../assets/icons";

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
  // Render
  return (
    <div className={styles.history_card}>
      <div className={styles.history_card_left}>
        <div className={styles.history_card_icon}>
          {GIFT_ICON}
        </div>
        <div className={styles.history_card_title}>
          <h5>{referral.name}</h5>
          <p>{formatTransactionDate(referral.event_ts)}</p>
        </div>
      </div>
      <div className={`${styles.credits_used}`}>
        +&nbsp;{referral.reward.toLocaleString()}
      </div>
    </div>
  );
}

// Functional Component
export default function ReferralsController() {
  // Data states
  const [referralCode, setReferralCode] = useState(null);
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralHistory, setReferralHistory] = useState([]);

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
    });
    setReferralHistory(response.data.data.referred_users);
  };
  useEffect(() => {
    fetchReferralHistory();
  }, []);

  // Sort transactions by date descending
  function sortByDateDescending(data) {
    return [...data].sort(
      (a, b) =>
        new Date(b.date_of_transaction) - new Date(a.date_of_transaction)
    );
  }
  const sortedReferralHistory = useMemo(
    () => sortByDateDescending(referralHistory),
    [referralHistory]
  );

  // Wrappers
  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
  }
  const handleShare = () => {
    const share_link = `https://app.omniverifier.com/invite?code=${referralCode}`;
    navigator.clipboard.writeText(share_link);
  }

  // Render
  return (
    <div className={styles.container}>
      {/* Referral Code */}
      <h1 className={styles.title}>Referrals</h1>
      <br />
      <div className={styles.metricsContainer}>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Referral Code</h2>
          <div className={styles.availableCredits}>
            {(referralCode !== null) && (referralCode)}
          </div>
          <div className={styles.referralActions}>
            <button onClick={handleCopy}>Copy</button>
            <button onClick={handleShare}>Share</button>
          </div>
        </div>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Total Referrals</h2>
          <div className={`${styles.availableCredits} ${styles.mini}`}>
            {(referralInfo !== null) && (referralInfo.num_referrals)}
          </div>
        </div>
        <div className={styles.referralCodeContainer}>
          <h2 className={styles.verificationText}>Total Rewards</h2>
          <div className={`${styles.availableCredits} ${styles.mini}`}>
            {(referralInfo !== null) && (referralInfo.total_referral_credits.toLocaleString())}
          </div>
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