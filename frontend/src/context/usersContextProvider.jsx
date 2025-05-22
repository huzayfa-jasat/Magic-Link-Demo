// Dependencies
import { useState, useMemo } from "react";

// Context
import { UsersContext } from "./usersContext";

// Provider Component
export const UsersContextProvider = ({ children }) => {
  // State
  const [user, setUser] = useState({
    email: "",
  });

  // Wrappers
  const onChangeUser = (userData) => {
    setUser((prev) => ({
      ...prev,
      ...userData,
    }));
  };
  const changeUserEmail = (e) => {
    setUser((prev) => ({ ...prev, email: e }));
  };
  
  // Values
  const values = useMemo(
    () => ({
      user,
      onChangeUser,
      changeUserEmail,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  // Return
  return (
    <UsersContext.Provider value={values}>{children}</UsersContext.Provider>
  );
};
