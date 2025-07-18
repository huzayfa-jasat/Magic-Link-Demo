// Dependencies
import { NavLink, useParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";

// API Imports
import { getBalance, listAllTransactions } from "../../api/credits";

// Style Imports
import styles from "./Credits.module.css";

// Icon Imports
import { COINS_ICON, EMAIL_ICON, GIFT_ICON } from "../../assets/icons";

// Helper Functions
function formatTransactionDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Helper Component
function TransactionCard({ transaction }) {

  // Get event type
  const eventIcon = () => {
    switch (transaction.event_typ) {
      case 'purchase':
        return COINS_ICON;
      case 'usage':
        return EMAIL_ICON;
      case 'refer_reward':
        return GIFT_ICON;
      case 'signup':
        return GIFT_ICON;
    }
  }
  const eventTitle = () => {
    switch (transaction.event_typ) {
      case 'usage':
        return 'Verified Emails';
      case 'refer_reward':
        return 'Referral Reward';
      case 'signup':
        return 'Signup Bonus';
      default:
        return 'Purchase';
    }
  }

  // Render
  return (
    <div className={styles.history_card}>
      <div className={styles.history_card_left}>
        <div className={styles.history_card_icon}>
          {eventIcon()}
        </div>
        <div className={styles.history_card_title}>
          <h5>{eventTitle()}</h5>
          <p>{formatTransactionDate(transaction.usage_ts)}</p>
        </div>
      </div>
      <div className={`${styles.credits_used} ${(transaction.credits_used < 0) ? styles.negative : ''}`}>
        {(transaction.credits_used < 0) ? '-' : '+'}&nbsp;
        {Math.abs(transaction.credits_used).toLocaleString()}
      </div>
    </div>
  );
}

// Functional Component
export default function CreditsController() {
  // Data states
  const [transactions, setTransactions] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(null);

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      const response = await listAllTransactions();
      setTransactions(response.data.data);
      return true;
    } catch (err) {
      console.error("Error fetching transactions:", err);
      return false;
    }
  };
  useEffect(() => {
    fetchTransactions();
  }, []);

  // Fetch current balance
  const fetchCurrentBalance = async () => {
    const response = await getBalance();
    setCurrentBalance(response.data.credit_balance);
  };
  useEffect(() => {
    fetchCurrentBalance();
  }, []);

  // Sort transactions by date descending
  function sortByDateDescending(data) {
    return [...data].sort(
      (a, b) =>
        new Date(b.date_of_transaction) - new Date(a.date_of_transaction)
    );
  }
  const sortedTransactions = useMemo(
    () => sortByDateDescending(transactions),
    [transactions]
  );

  // Render
  return (
    <div className={styles.container}>
      {/* Current Balance */}
      <h1 className={styles.title}>Credits</h1>
      <br />
      <div className={styles.balanceContainer}>
        <h2 className={styles.verificationText}>Balance</h2>
        <div className={styles.availableCredits}>
          {(currentBalance !== null) && (currentBalance.toLocaleString())}
        </div>
        <NavLink to="/packages" className={styles.packagesButton}>
          Buy Credits
        </NavLink>
      </div>
      <br /><br /><br />
      {/* Activity */}
      <h1 className={styles.title}>Activity</h1>
      <br />
      <div className={styles.history_list}>
        {sortedTransactions.map((trans, idx) => (
          <TransactionCard key={`tx-${idx}`} transaction={trans} />
        ))}
      </div>
    </div>
  );
}
