// Dependencies
import { useState, useMemo, useCallback, useEffect } from "react";

// Context
import { CreditsContext } from "./creditsContext";

// API Imports
import { getBalance, getCatchallBalance } from "../api/credits";

// Provider Component
export const CreditsContextProvider = ({ children }) => {
  // State
  const [emailBalance, setEmailBalance] = useState(0);
  const [catchallBalance, setCatchallBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Load balances from API
  const loadBalances = useCallback(async () => {
    try {
      const [emailResponse, catchallResponse] = await Promise.all([
        getBalance(),
        getCatchallBalance()
      ]);
      
      if (emailResponse.status === 200) {
        setEmailBalance(emailResponse.data.credit_balance);
      }
      if (catchallResponse.status === 200) {
        setCatchallBalance(catchallResponse.data.credit_balance);
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

  // Values
  const values = useMemo(
    () => ({
      emailBalance,
      catchallBalance,
      isLoading,
      loadBalances,
      updateEmailBalance,
      updateCatchallBalance,
    }),
    [emailBalance, catchallBalance, isLoading, loadBalances, updateEmailBalance, updateCatchallBalance]
  );

  // Return
  return (
    <CreditsContext.Provider value={values}>{children}</CreditsContext.Provider>
  );
};