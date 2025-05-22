import styles from "./Packages.module.css";

const creditOptions = [
  {
    name: "Starter Plan",
    amount: "10,000",
    price: "$31",
    bonus: null,
    total: null,
  },
  {
    name: "Basic Plan",
    amount: "25,000",
    price: "$42",
    bonus: null,
    total: null,
  },
  {
    name: "Standard Plan",
    amount: "50,000",
    price: "$65",
    bonus: null,
    total: null,
  },
  {
    name: "Pro Plan",
    amount: "100,000",
    price: "$110",
    bonus: null,
    total: null,
  },
  {
    name: "Business Plan",
    amount: "500,000",
    price: "$220",
    bonus: null,
    total: null,
  },
  {
    name: "Enterprise Plan",
    amount: "1,000,000",
    price: "$331",
    bonus: null,
    total: null,
  },
  {
    name: "Elite Plan",
    amount: "2,000,000",
    price: "$577",
    bonus: null,
    total: null,
  },
  {
    name: "Premium 3M Plan",
    amount: "3,000,000",
    price: "$824",
    bonus: "1 Million",
    total: "4,000,000",
  },
  {
    name: "Premium 4M Plan",
    amount: "4,000,000",
    price: "$1,036",
    bonus: "1 Million",
    total: "5,000,000",
  },
  {
    name: "Premium 5M Plan",
    amount: "5,000,000",
    price: "$1,223",
    bonus: "1 Million",
    total: "6,000,000",
  },
  {
    name: "Ultimate Plan",
    amount: "10,000,000",
    price: "$2,150",
    bonus: "2 Million",
    total: "12,000,000",
  },
];

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
                <div className={styles.extraCredits}>+ {bonus} = {total}</div>
              </div>
            )}
            <p className={styles.verificationText}>
              Email Verification Credits
            </p>
            <p className={styles.price}>Only {price} USD</p>
            <button className={styles.buyBtn}>Buy Credits</button>
          </div>
        ))}
      </div>
    </div>
  );
}
