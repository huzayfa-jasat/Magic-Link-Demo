import { http } from "./http";

export const createCheckout = async (package_name) => {
  return await http.post(
    "/create-checkout",
    {
      body: package_name,
    },
    {
      withCredentials: true,
    }
  );
};
