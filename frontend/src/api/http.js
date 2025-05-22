import axios from "axios";

const prefix = `${
  process.env.REACT_APP_ENV_MODE === "development"
    ? process.env.REACT_APP_API_URL_DEV
    : process.env.REACT_APP_API_URL_PROD
}`;

export const http = axios.create({
  baseURL: prefix || "",
  validateStatus: () => true    // Stop blanket error throw
});
