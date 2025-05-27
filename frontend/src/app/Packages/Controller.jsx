import styles from "./Packages.module.css";
import { createCheckout } from "../../api/purchase";
import { creditOptions } from "./creditOptions";

const handleBuyCredits = async (package_name) => {
  const stripe_url = await createCheckout(package_name).catch((err) =>
    console.error("Could not fetch stripe url:", err)
  );
  window.open(stripe_url, "_blank");
};

export default function PackagesController() {
  return (
    <div className={styles.container}>
      <h1 className={styles.h1Header}>
        <span className={styles.title}>Packages</span>
      </h1>

      <div className={styles.creditGrid}>
        {creditOptions.map(
          ({ name, amount, price, bonus, total, package_name }) => (
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
              <p className={styles.price}>Only {price} USD</p>
              <button
                className={styles.buyBtn}
                onClick={() => handleBuyCredits(package_name)}
              >
                Buy Credits
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
