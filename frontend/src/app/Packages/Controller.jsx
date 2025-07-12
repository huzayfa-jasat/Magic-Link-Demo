// API Imports
import { createCheckout } from "../../api/purchase";

// Constant Imports
import { creditOptions } from "./creditOptions";

// Icon Imports
import { GIFT_ICON } from "../../assets/icons";

// Style Imports
import styles from "./Packages.module.css";

// Wrapper Functions
const handleBuyCredits = async (package_code) => {
  try {
    const resp = await createCheckout(package_code).catch((err) =>
      console.error("Could not fetch stripe url:", err)
    );
    if (resp.status === 200) {
      window.open(resp.data.stripe_url, "_blank");
    } else {
      console.error("Could not fetch stripe url:", resp.data.error);
    }
  } catch (err) {
    console.error("Could not fetch stripe url:", err);
  }
};

// Main Component
export default function PackagesController() {
  // Basic Filters
  const promotions = creditOptions.filter((option) => (option.bonus !== null));
  const nonPromotions = creditOptions.filter((option) => (option.bonus === null));

  // Render Promotions
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Promotions</h1>
      <br/>
      <div className={styles.creditGrid}>
        {promotions.map(
          ({ name, amount, price, bonus, total, package_code }) => (
            <div className={styles.creditCard} key={name}>
              <h1 className={styles.packageName}>{name}</h1>
              <h2 className={styles.numCredits}>{amount}</h2>
              <p className={styles.verificationText}>
                Email Verification Credits
              </p>
              {total && (
                <div className={styles.bonusContainer}>
                  <h4 className={styles.bonus}>
                    Omni Bonus Promotion
                  </h4>
                  <div className={styles.extraCredits}>
                    {GIFT_ICON}
                    <span>+{bonus} = {total}</span>
                  </div>
                </div>
              )}
              {/* <p className={styles.price}>Only {price} USD</p> */}
              <button
                className={`${styles.buyBtn} ${styles.premium}`}
                onClick={() => handleBuyCredits(package_code)}
              >
                {/* Buy Credits */}
                Only {price} USD
              </button>
            </div>
          )
        )}
      </div>
      <br/><br/>
      <h1 className={styles.title}>Packages</h1>
      <br/>
      <div className={styles.creditGrid}>
        {nonPromotions.map(
          ({ name, amount, price, bonus, total, package_code }) => (
            <div className={styles.creditCard} key={name}>
              <h1 className={styles.packageName}>{name}</h1>
              <h2 className={styles.numCredits}>{amount}</h2>
              {total && (
                <div>
                  <h4 className={styles.bonus}>OMNI BONUS PROMOTION!!</h4>
                  <div className={styles.extraCredits}>
                    + {bonus} = {total}
                  </div>
                </div>
              )}
              <p className={styles.verificationText}>
                Email Verification Credits
              </p>
              {/* <p className={styles.price}>Only {price} USD</p> */}
              <button
                className={styles.buyBtn}
                onClick={() => handleBuyCredits(package_code)}
              >
                {/* Buy Credits */}
                Only {price} USD
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
