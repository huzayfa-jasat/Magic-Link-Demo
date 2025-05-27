// Dependencies
import { http } from "./http";

/*
------------------------
> EMAILS API CALLS <
------------------------
*/

/**
 * Verify a single email address
 * @param {string} email - The email address to verify
 * @returns {Promise} The verify request ID
 */
export const verifySingleEmail = async (email) => {
  return await http.post(
    "/emails/verify/single",
    { email },
    {
      withCredentials: true,
    }
  );
};

/**
 * Verify multiple email addresses in bulk
 * @param {string[]} emails - Array of email addresses to verify
 * @returns {Promise} The verify request ID
 */
export const verifyBulkEmails = async (emails) => {
  return await http.post(
    "/emails/verify/bulk",
    { emails },
    {
      withCredentials: true,
    }
  );
};

/**
 * Verify emails from an import
 * @param {string[]} emails - Array of email addresses to verify
 * @param {string} [requestId] - Optional request ID to associate with the import
 * @param {string} [fileName] - Optional file name
 * @returns {Promise} The verify request ID
 */
export const verifyImportEmails = async (
  emails,
  requestId = null,
  fileName = null
) => {
  return await http.post(
    "/emails/verify/import",
    { emails, request_id: requestId, file_name: fileName },
    {
      withCredentials: true,
    }
  );
};

/**
 * Get details for a specific verify request
 * @param {string} requestId - The ID of the verify request
 * @returns {Promise} The verify request details
 */
export const getVerifyRequestDetails = async (requestId) => {
  return await http.get(`/emails/request/${requestId}/dtl`, {
    withCredentials: true,
  });
};

/**
 * List all verify requests for the current user
 * @returns {Promise} List of verify requests
 * Response: num_contacts, num_processed, num_invalid, num_catch_all, request_id, request_type
 */
export const listVerifyRequests = async () => {
  return await http.get("/emails/requests/list", {
    withCredentials: true,
  });
};

/**
 * Get paginated results for a specific verify request
 * @param {string} requestId - The ID of the verify request
 * @param {number} page - The page number (1-based)
 * @param {number} [perPage=50] - Number of results per page
 * @param {string} [search] - Optional search query to filter emails
 * @returns {Promise} Paginated verify request results
 */
export const getPaginatedVerifyRequestResults = async (
  requestId,
  page,
  perPage = 50,
  search = null
) => {
  const params = { page, per_page: perPage };
  if (search && search.trim()) {
    params.search = search.trim();
  }
  return await http.get(`/emails/requests/${requestId}/results`, {
    params,
    withCredentials: true,
  });
};

/**
 * Get paginated email results for the current user
 * @param {number} page - The page number (1-based)
 * @param {number} [perPage=50] - Number of results per page
 * @returns {Promise} Paginated email results
 */
export const getPaginatedEmailResults = async (page, perPage = 50) => {
  return await http.get("/emails/emails/results", {
    params: { page, per_page: perPage },
    withCredentials: true,
  });
};

/**
 * Get paginated results for a specific verify request
 * @param {string} requestId - The ID of the verify request
 * @param {number} page - The page number (1-based)
 * @param {number} [perPage=50] - Number of results per page
 * @param {string} filter
 * @returns {Promise} Paginated verify request results
 */

export const exportBatchResultsCsv = async (
  requestId,
  page = 1,
  perPage = 50,
  filter
) => {
  return await http.get("/emails/export-batch-results", {
    query: { requestId, filter, page, perPage },
    withCredentials: true,
  });
};