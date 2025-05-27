// Dependencies
import { http } from "./http";

/*
------------------------
> CREDITS API CALLS <
------------------------
*/

// response: data.credit_balance
export const getBalance = async (userId) => {
  return await http.get(
    "/balance",
    {
      user: { id: userId },
    },
    {
      withCredentials: true,
    }
  );
  // .then((res) => {
  //   console.log(res);
  // });
};

export const purchaseCredits = async () => {
  return await http.post("/purchase", {
    // TODO
  });
};

export const getReferralInviteCode = async () => {
  return await http.get("/invite/code", {
    // TODO
  });
};

export const getReferralInviteList = async () => {
  return await http.get("/invites/list", {
    // TODO
  });
};

export const listAllTransactions = async () => {
  return await http.get("/purchase/history", {
    withCredentials: true,
  });
};
