import styles from "./Packages.module.css";
import { creditOptions } from "./CONSTANTDATA";

export default function PackagesController() {
  return (
    <div className={styles.container}>
      <h1 className={styles.h1Header}>
        <span className={styles.title}>Packages</span>
      </h1>

      <div className={styles.creditGrid}>
        {creditOptions.map(({ name, amount, price, bonus, total }) => (
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
            <a className={styles.buyBtn} href="#">
              Buy Credits
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
