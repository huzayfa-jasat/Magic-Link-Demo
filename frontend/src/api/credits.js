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

export const getReferralInviteCode = async () => {
  return await http.get(`${MODULE_PREFIX}/invite/code`, {
    withCredentials: true,
  });
};

export const getReferralInviteList = async () => {
  return await http.get(`${MODULE_PREFIX}/invites/list`, {
    withCredentials: true,
  });
};

export const listAllTransactions = async () => {
  return await http.get(`${MODULE_PREFIX}/history`, {
    withCredentials: true,
  });
};
