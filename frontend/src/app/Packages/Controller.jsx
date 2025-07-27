// Dependencies
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// API Imports
import { createCheckout, getPackages } from "../../api/purchase";

// Component Imports
import PackageCard from "./components/PackageCard";

// Style Imports
import styles from "./styles/Packages.module.css";

// Wrapper Functions
const handleBuyCredits = async (package_code) => {
  try {
    const resp = await createCheckout(package_code);
    if (resp.status === 200) {
      window.open(resp.data.url, "_blank");
    } else {
      console.error("Could not fetch stripe url:", resp.data.error);
    }
  } catch (err) {
    console.error("Could not fetch stripe url:", err);
  }
};

// Main Component
export default function PackagesController() {
  // Get search params
  const [searchParams, _setSearchParams] = useSearchParams();
  const pageParam = searchParams.get("p");

  // States
  const [currPage, setCurrPage] = useState((pageParam === "catchall") ? "catchall" : "validate");
  const [validatePromotions, setValidatePromotions] = useState([]);
  const [validateNonPromotions, setValidateNonPromotions] = useState([]);
  const [catchallPromotions, setCatchallPromotions] = useState([]);
  const [catchallNonPromotions, setCatchallNonPromotions] = useState([]);

  // Load packages
  async function loadPackages() {
    const resp = await getPackages();
    if (resp.status === 200) {
      const validate_packages = resp.data.validate;
      const catchall_packages = resp.data.catchall;
      setValidatePromotions(validate_packages.filter((option) => (option.bonus !== null)));
      setValidateNonPromotions(validate_packages.filter((option) => (option.bonus === null)));
      setCatchallPromotions(catchall_packages.filter((option) => (option.bonus !== null)));
      setCatchallNonPromotions(catchall_packages.filter((option) => (option.bonus === null)));
    } else {
      console.error("Could not fetch packages:", resp.data.error);
    }
  }
  useEffect(() => {
    loadPackages();
  }, []);

  // Render Promotions
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Get Credits</h1>
      <br/>
      <div className={styles.pageSelector}>
        <button
          className={`${styles.pageButton} ${(currPage === "validate") ? styles.active : ""}`}
          onClick={() => setCurrPage("validate")}
        >
          Email Validation
        </button>
        <button
          className={`${styles.pageButton} ${(currPage === "catchall") ? styles.active : ""}`}
          onClick={() => setCurrPage("catchall")}
        >
          Catchall Validation
        </button>
      </div>
      <br/><br/>
      <div className={styles.creditGrid}>
        {((currPage === "catchall") ? catchallNonPromotions : validateNonPromotions).map(
          ({ name, amount, price, bonus, total, id }) => (
            <PackageCard
              key={id}
              name={name} amount={amount} price={price} bonus={bonus} total={total}
              handleClick={() => handleBuyCredits(id)}
            />
          )
        )}
      </div>
      {((currPage === "catchall") ? catchallPromotions.length > 0 : validatePromotions.length > 0) && (
        <>
          <br/><br/>
          <h1 className={styles.title}>Promotions</h1>
          <br/>
          <div className={styles.creditGrid}>
            {((currPage === "catchall") ? catchallPromotions : validatePromotions).map(
              ({ name, amount, price, bonus, total, id }) => (
                <PackageCard
                  key={id}
                  name={name} amount={amount} price={price} bonus={bonus} total={total}
                  handleClick={() => handleBuyCredits(id)}
                />
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
