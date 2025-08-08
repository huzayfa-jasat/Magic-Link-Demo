// Dependencies
import { useState, useMemo, useCallback, useEffect } from "react";

// Context
import { CreditsContext } from "./creditsContext";

// API Imports
import { getBalance, getCatchallBalance } from "../api/credits";
import { getSubscriptionStatus } from "../api/subscriptions";

// Provider Component
export const CreditsContextProvider = ({ children }) => {
  // State
  const [emailBalance, setEmailBalance] = useState(0);
  const [catchallBalance, setCatchallBalance] = useState(0);
  const [subscriptionCredits, setSubscriptionCredits] = useState({
    regular: null,
    catchall: null
  });
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load balances from API
  const loadBalances = useCallback(async () => {
    try {
      const [emailResponse, catchallResponse, subscriptionResponse] = await Promise.all([
        getBalance(),
        getCatchallBalance(),
        getSubscriptionStatus()
      ]);
      
      if (emailResponse.status === 200) {
        setEmailBalance(emailResponse.data.credit_balance);
      }
      if (catchallResponse.status === 200) {
        setCatchallBalance(catchallResponse.data.credit_balance);
      }
      if (subscriptionResponse.status === 200 && subscriptionResponse.data.has_subscription) {
        setSubscription(subscriptionResponse.data.subscriptions);
        setSubscriptionCredits(subscriptionResponse.data.credits || {
          regular: null,
          catchall: null
        });
      } else {
        setSubscription(null);
        setSubscriptionCredits({ regular: null, catchall: null });
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading credit balances:", error);
      setIsLoading(false);
    }
  }, []);

  // Update specific balance
  const updateEmailBalance = useCallback((newBalance) => {
    setEmailBalance(newBalance);
  }, []);

  const updateCatchallBalance = useCallback((newBalance) => {
    setCatchallBalance(newBalance);
  }, []);

  // Load balances on mount
  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Calculate total available credits
  const totalEmailCredits = useMemo(() => {
    const subCredits = subscriptionCredits.regular?.remaining || 0;
    return emailBalance + subCredits;
  }, [emailBalance, subscriptionCredits.regular]);

  const totalCatchallCredits = useMemo(() => {
    const subCredits = subscriptionCredits.catchall?.remaining || 0;
    return catchallBalance + subCredits;
  }, [catchallBalance, subscriptionCredits.catchall]);

  // Values
  const values = useMemo(
    () => ({
      emailBalance,
      catchallBalance,
      subscriptionCredits,
      subscription,
      totalEmailCredits,
      totalCatchallCredits,
      isLoading,
      loadBalances,
      updateEmailBalance,
      updateCatchallBalance,
    }),
    [emailBalance, catchallBalance, subscriptionCredits, subscription, totalEmailCredits, totalCatchallCredits, isLoading, loadBalances, updateEmailBalance, updateCatchallBalance]
  );

  // Return
  return (
    <CreditsContext.Provider value={values}>{children}</CreditsContext.Provider>
  );
};