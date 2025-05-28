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
    { value: name },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileLogo = async (pfp) => {
  return await http.patch(
    "/settings/profile/pfp/touch",
    { value: pfp },
    {
      withCredentials: true,
    }
  );
};

export const updateProfileEmail = async (email) => {
  return await http.patch(
    "/settings/profile/email/touch",
    { value: email },
    {
      withCredentials: true,
    }
  );
};
