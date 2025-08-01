// Dependencies
import { useState, useEffect, useMemo } from "react";

// API Imports
import {
  getBalance, getCatchallBalance,
  listAllTransactions, listCatchallTransactions,
} from "../../api/credits";

// Component Imports
import BalanceCard from "./components/BalanceCard";
import TransactionCard from "./components/TransactionCard";

// Style Imports
import styles from "./styles/Credits.module.css";

// Functional Component
export default function CreditsController() {
  // Data states
  const [transactions, setTransactions] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(null);
  const [catchallCurrentBalance, setCatchallCurrentBalance] = useState(null);

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      // Fetch both regular and catchall transactions in parallel
      const [regularResponse, catchallResponse] = await Promise.all([
        listAllTransactions(),
        listCatchallTransactions()
      ]);
      
      // Combine both transaction lists
      const allTransactions = [
        ...regularResponse.data.data,
        ...catchallResponse.data.data
      ];
      
      setTransactions(allTransactions);
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
  const fetchCatchallCurrentBalance = async () => {
    const response = await getCatchallBalance();
    setCatchallCurrentBalance(response.data.credit_balance);
  };
  useEffect(() => {
    fetchCurrentBalance();
    fetchCatchallCurrentBalance();
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
      <div className={styles.balanceRow}>
        <BalanceCard
          title="Email Validation"
          balance={currentBalance}
          buttonText="Get More Credits"
          buttonLink="/packages?p=validate"
        />
        <BalanceCard
          title="Catchall Validation"
          balance={catchallCurrentBalance}
          buttonText="Get More Credits"
          buttonLink="/packages?p=catchall"
        />
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
