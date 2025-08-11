// Dependencies
import { useState, useEffect, useMemo, useContext } from "react";

// API Imports
import { getReferralInviteCode, getReferralInviteList } from "../../api/credits";

// Context Imports
import { ErrorContext } from "../../ui/Context/ErrorContext";

// Component Imports
import ReferralEligibilityNotice from "./components/ReferralEligibilityNotice";
import ReferralCard from "./components/ReferralCard";

// Style Imports
import styles from "./Referrals.module.css";

// Icon Imports
import { COMPLETE_CHECK_ICON, UNLOCK_ICON } from "../../assets/icons";

// Functional Component
export default function ReferralsController() {
  const errorContext = useContext(ErrorContext);

  // Data states
  const [referralCode, setReferralCode] = useState(null);
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralHistory, setReferralHistory] = useState([]);
  const [pendingReferrals, setPendingReferrals] = useState([]);
  const [userEligible, setUserEligible] = useState(null);
  const [userLifetimePurchases, setUserLifetimePurchases] = useState(0);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [eligibilityNoticeOpen, setEligibilityNoticeOpen] = useState(false);
  
  // Fetch referral code
  const fetchReferralCode = async () => {
    try {
      const response = await getReferralInviteCode();
      if (response.status !== 200) errorContext.showError();
      else setReferralCode(response.data.data);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
  };
  useEffect(() => {
    fetchReferralCode();
  }, []);

  // Fetch referral history
  const fetchReferralHistory = async () => {
    const response = await getReferralInviteList();
    if (response.status !== 200) errorContext.showError();
    else {
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
    }
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
    <>
      {(eligibilityNoticeOpen) && (
        <ReferralEligibilityNotice purchases={userLifetimePurchases} onClose={()=>{setEligibilityNoticeOpen(false)}} />
      )}
      <div className={styles.container}>
        {/* Referral Banner */}
        <div className={styles.referralBanner}>
          <div className={styles.bannerIcon}>
            🎉
          </div>
          <div className={styles.bannerContent}>
            <h3 className={styles.bannerTitle}>Refer More = Earn More</h3>
            <p className={styles.bannerSubtitle}>For every referral you make, you BOTH get 25,000 credits each (worth $42).</p>
          </div>
        </div>
        {/* Referral Code */}
        <div className={styles.metricsContainer}>
          <div className={styles.referralCodeContainer}>
            <h2 className={styles.verificationText}>Referral Code</h2>
            <div className={styles.availableCredits}>
              {(referralCode !== null) && (referralCode)}
            </div>
            {(userEligible === false) && (
              <button className={`${styles.referralActionsButton} ${styles.eligibilityNoticeButton}`} onClick={()=>{setEligibilityNoticeOpen(true)}}>
                {UNLOCK_ICON}
                Unlock Rewards
              </button>
            )}
            <div className={styles.referralActions}>
              <button onClick={handleShare} className={`${styles.referralActionsButton} ${(shareSuccess) ? styles.copySuccess : ""}`}>
                {shareSuccess && COMPLETE_CHECK_ICON}
                {shareSuccess ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>
        </div>
        <br /><br />
        {/* Referral Metrics */}
        <h1 className={styles.title}>Referrals</h1>
        <br/>
        <div className={styles.metricsContainer}>
          <div className={styles.referralCodeContainer}>
            <h2 className={styles.verificationText}>Total Referrals</h2>
            <div className={`${styles.availableCredits} ${styles.mini}`}>
              {(referralInfo !== null) && (
                referralInfo.num_referrals + referralInfo.num_pending_referrals
              )}
            </div>
            {(referralInfo && referralInfo.num_pending_referrals > 0) && (
              <p className={styles.pendingCount}>{referralInfo.num_pending_referrals} Pending</p>
            )}
          </div>
          <div className={styles.referralCodeContainer}>
            <h2 className={styles.verificationText}>Total Rewards</h2>
            <div className={`${styles.availableCredits} ${styles.mini}`}>
              {(referralInfo !== null) && (referralInfo.total_referral_credits.toLocaleString())}
            </div>
            {(referralInfo && referralInfo.num_pending_referrals > 0) && (
              <p className={styles.pendingCount}>
                +{referralInfo.total_pending_credits.toLocaleString()} Pending
              </p>
            )}
          </div>
        </div>
        <br /><br />
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
    </>
  );
}