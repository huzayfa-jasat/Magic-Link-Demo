// Dependencies
import { http } from "./http";

/*
------------------
> AUTH API CALLS <
------------------
*/

export const getAuthStatus = async () => {
  return await http.get("/auth/status", {
    withCredentials: true,
  });
};

export const loginUser = async (username, password) => {
  const resp = await http.post(
    "/auth/login",
    { username, password },
    { withCredentials: true }
  );

  return resp.status === 200;
};

export const registerUser = async (email, pass, name, invite_code, pfp = null) => {
  return await http.post(
    "/auth/register",
    {
      em: email,
      pw: pass,
      dn: name !== null && name.length > 0 ? name : email,
      pfp: pfp,
      code: invite_code,
    },
    { withCredentials: true }
  );
};

export const sendForgotPasswordEmail = async (email) => {
  return await http.post(
    "/auth/forgot-password/send",
    { email },
    { withCredentials: true }
  );
};

export const sendOtpCode = async (email) => {
  return await http.post(
    "/auth/otp/send",
    { email },
    { withCredentials: true }
  );
};

export const verifyOtpCode = async (email, code) => {
  return await http.post(
    "/auth/otp/verify",
    { email, code },
    { withCredentials: true }
  );
};

export const updatePassword = async (new_password) => {
  return await http.patch(
    "/auth/pw/touch",
    { p: new_password },
    { withCredentials: true }
  );
};

export const logoutUser = async () => {
  return await http.get("/auth/logout", { withCredentials: true });
};
