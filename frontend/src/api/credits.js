// Dependencies
import { http } from "./http";

// Constants
const MODULE_PREFIX = "/credits";
const CATCHALL_MODULE_PREFIX = "/catchall-credits";

/*
------------------------
> CREDITS API CALLS <
------------------------
*/

export const getBalance = async () => {
  return await http.get(`${MODULE_PREFIX}/balance`, {
    withCredentials: true,
  });
};

export const getCatchallBalance = async () => {
  return await http.get(`${CATCHALL_MODULE_PREFIX}/balance`, {
    withCredentials: true,
  });
};

export const listAllTransactions = async () => {
  return await http.get(`${MODULE_PREFIX}/history`, {
    withCredentials: true,
  });
};

export const listCatchallTransactions = async () => {
  return await http.get(`${CATCHALL_MODULE_PREFIX}/history`, {
    withCredentials: true,
  });
};

export const getReferralInviteCode = async () => {
  return await http.get(`${MODULE_PREFIX}/invites/me`, {
    withCredentials: true,
  });
};

export const getReferralInviteList = async () => {
  return await http.get(`${MODULE_PREFIX}/invites/list`, {
    withCredentials: true,
  });
};

export const redeemReferralInviteCode = async (code) => {
  return await http.post(`${MODULE_PREFIX}/invites/redeem`, {
    code,
  }, {
    withCredentials: true,
  });
};

export const getOverviewStats = async () => {
  return await http.get(`${MODULE_PREFIX}/lifetime`, {
    withCredentials: true,
  });
};