import styles from "./Credits.module.css";
import { getBalance, listAllTransactions } from "../../api/credits";
import { NavLink, useParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";

const data = {
  data: [
    {
      type: "purchased",
      amount: 300,
      date_of_transaction: "2025-05-01",
    },
    {
      type: "spent",
      amount: 120,
      date_of_transaction: "2025-05-03",
    },
    {
      type: "purchased",
      amount: 500,
      date_of_transaction: "2025-05-05",
    },
    {
      type: "spent",
      amount: 75,
      date_of_transaction: "2025-05-10",
    },
    {
      type: "purchased",
      amount: 250,
      date_of_transaction: "2025-05-15",
    },
    {
      type: "spent",
      amount: 180,
      date_of_transaction: "2025-05-17",
    },
    {
      type: "purchased",
      amount: 400,
      date_of_transaction: "2025-05-20",
    },
  ],
};

export default function HomeController() {
  const { id } = useParams();
  const [transactions, setTransactions] = useState([]);

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

  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.title}>Available Credits</h1>
        <br />
        <div className={styles.innerContainer}>
          <div className={styles.availableCredits}>
            {/* {getBalance(id).data.credit_balance} */}
            500
          </div>
          <div className={styles.verificationText}>
            Email Verification Credits Remaining
          </div>
          <NavLink to="/packages" className={styles.packagesButton}>
            Buy Credits
          </NavLink>
        </div>
      </div>
      <div>
        <h1 className={styles.title}>Balance History</h1>
        <br />
        <div className={styles.history_list}>
          {sortedTransactions.map((trans) => (
            <div className={styles.history_card}>
              <div>Amount Purchased: {trans.amount}</div>
              <div>
                {`Date: ${new Date(trans.date_of_transaction).toLocaleDateString(
                  "en-US",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }
                )}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
