/**
 * HTTP Status Codes and Messages
 * This module exports specific HTTP status codes and messages
 * for consistent usage throughout the application.
 */

const HttpStatus = {
  // Success Code
  SUCCESS_STATUS: 200,
  
  // Error Codes
  FAILED_STATUS: 400,
  MISC_ERROR_STATUS: 500,
  NOT_FOUND_STATUS: 404,
  UNAUTHORIZED_STATUS: 401,
  
  // Error Messages
  MISC_ERROR_MSG: "Misc Error"
};

module.exports = HttpStatus;