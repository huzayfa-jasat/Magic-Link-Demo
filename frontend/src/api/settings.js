// Dependencies
import { http } from "./http";

// Constants
const MODULE_PREFIX = "/settings";

/*
------------------------
> SETTINGS API CALLS <
------------------------
*/

export const getProfileDetails = async () => {
  return await http.get(`${MODULE_PREFIX}/profile/dtl`, {
    withCredentials: true,
  });
};

export const updateProfileName = async (name) => {
  return await http.patch(
    `${MODULE_PREFIX}/profile/name/touch`,
    { value: name },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileLogo = async (pfp) => {
  return await http.patch(
    `${MODULE_PREFIX}/profile/pfp/touch`,
    { value: pfp },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileEmail = async (email) => {
  return await http.patch(
    `${MODULE_PREFIX}/profile/email/touch`,
    { value: email },
    {
      withCredentials: true,
    }
  );
};
