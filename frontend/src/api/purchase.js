// Dependencies
import { http } from "./http";

// Constants
const MODULE_PREFIX = "/pay";

/*
------------------------
> PURCHASE API CALLS <
------------------------
*/

export const getPackages = async () => {
  return await http.get(`${MODULE_PREFIX}/packages/list`, {
    withCredentials: true
  });
};

export const createCheckout = async (package_code) => {
  return await http.post(`${MODULE_PREFIX}/checkout`,{
      package_code,
    }, {
      withCredentials: true,
    }
  );
};
