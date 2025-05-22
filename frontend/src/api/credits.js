// Dependencies
import { http } from "./http";

/*
------------------------
> SETTINGS API CALLS <
------------------------
*/

export const getProfileDetails = async () => {
  return await http.get("/settings/profile/dtl", {
    withCredentials: true,
  });
};

export const updateProfileName = async (name) => {
  return await http.patch(
    "/settings/profile/name/touch",
    { name },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileLogo = async (pfp) => {
  return await http.patch(
    "/settings/profile/pfp/touch",
    { pfp },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileEmail = async (email) => {
  return await http.patch(
    "/settings/profile/email/touch",
    { email },
    {
      withCredentials: true,
    }
  );
};
