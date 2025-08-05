// Dependencies
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// API Imports
import { createCheckout, getPackages } from "../../api/purchase";
import { getSubscriptionPlans, createSubscriptionCheckout, createPortalSession } from "../../api/subscriptions";

// Component Imports
import PackageCard from "./components/PackageCard";
import SubscriptionCard from "./components/SubscriptionCard";

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
  const [currPage, setCurrPage] = useState(
    pageParam === "catchall" ? "catchall" : 
    pageParam === "subscriptions" ? "subscriptions" : 
    "validate"
  );
  const [validatePromotions, setValidatePromotions] = useState([]);
  const [validateNonPromotions, setValidateNonPromotions] = useState([]);
  const [catchallPromotions, setCatchallPromotions] = useState([]);
  const [catchallNonPromotions, setCatchallNonPromotions] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);

  // Switch views on param change
  useEffect(() => {
    setCurrPage(
      pageParam === "catchall" ? "catchall" : 
      pageParam === "subscriptions" ? "subscriptions" : 
      "validate"
    );
  }, [pageParam]);

  // Load packages and subscriptions
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

  // Load subscription plans
  async function loadSubscriptions() {
    const resp = await getSubscriptionPlans();
    if (resp.status === 200) {
      setSubscriptionPlans(resp.data.plans || []);
      setCurrentSubscription(resp.data.current_subscription);
    }
  }

  // Handle subscription purchase
  const handleSubscribe = async (planId) => {
    try {
      const resp = await createSubscriptionCheckout(planId);
      if (resp.status === 200) {
        window.location.href = resp.data.checkout_url;
      } else {
        console.error("Could not create subscription checkout:", resp.data.error);
      }
    } catch (err) {
      console.error("Could not create subscription checkout:", err);
    }
  };

  // Handle manage subscription
  const handleManageSubscription = async () => {
    try {
      const resp = await createPortalSession();
      if (resp.status === 200) {
        window.open(resp.data.portal_url, "_blank");
      } else {
        console.error("Could not create portal session:", resp.data.error);
      }
    } catch (err) {
      console.error("Could not create portal session:", err);
    }
  };

  useEffect(() => {
    loadPackages();
    loadSubscriptions();
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
          Email <span className={styles.hideMobile}>Validation</span>
        </button>
        <button
          className={`${styles.pageButton} ${(currPage === "catchall") ? styles.active : ""}`}
          onClick={() => setCurrPage("catchall")}
        >
          Catchall <span className={styles.hideMobile}>Validation</span>
        </button>
        <button
          className={`${styles.pageButton} ${(currPage === "subscriptions") ? styles.active : ""}`}
          onClick={() => setCurrPage("subscriptions")}
        >
          Monthly <span className={styles.hideMobile}>Plans</span>
        </button>
      </div>
      <br/>
      {currPage === "subscriptions" ? (
        <div className={styles.creditGrid}>
          {subscriptionPlans.map((plan) => (
            <SubscriptionCard
              key={plan.id}
              plan={plan}
              currentPlan={currentSubscription}
              isSubscribed={!!currentSubscription}
              handleSubscribe={handleSubscribe}
              handleManage={handleManageSubscription}
            />
          ))}
        </div>
      ) : (
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
      )}
      {currPage !== "subscriptions" && ((currPage === "catchall") ? catchallPromotions.length > 0 : validatePromotions.length > 0) && (
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
