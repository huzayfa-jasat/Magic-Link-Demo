import { useContext } from "react";
import { CreditsContext } from "./creditsContext";

export const useCreditsContext = () => {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error("useCreditsContext must be used within a CreditsContextProvider");
  }
  return context;
};