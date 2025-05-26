import styles from "./Credits.module.css";

import { getBalance } from "../../api/credits";

import { NavLink, useParams } from "react-router-dom";

export default function HomeController() {
  const { id } = useParams();
  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.title}>Available Credits:</h1>
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
      </div>
    </div>
  );
}
