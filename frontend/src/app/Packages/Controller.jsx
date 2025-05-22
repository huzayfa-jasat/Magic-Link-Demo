import styles from "./Packages.module.css";

const creditOptions = [
  { amount: 10000, price: 29 },
  { amount: 25000, price: 39 },
  { amount: 50000, price: 59 },
  { amount: 100000, price: 99 },
];

export default function PackagesController() {
  return (
    <div className={styles.container}>
      <h1 className={styles.h1Header}>
        <span className={styles.title}>Packages</span>
      </h1>

      <div className={styles.creditGrid}>
        {creditOptions.map(({ amount, price }) => (
          <div className={styles.creditCard} key={amount}>
            <h2>{amount.toLocaleString()}</h2>
            <p>Email Verification Credits</p>
            <p className={styles.price}>Only {price} USD</p>
            <button className={styles.buyBtn}>Buy Credits</button>
          </div>
        ))}
      </div>
    </div>
  );
}
