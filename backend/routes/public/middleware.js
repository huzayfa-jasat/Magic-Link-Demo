// Type Imports
const HttpStatus = require('../../types/HttpStatus.js');

// Function Imports
const { db_getUserIdFromApiKey } = require('./funs_db.js');

// Helper Functions
function sendApiKeyError(res) {
    return res.status(HttpStatus.FAILED_STATUS).json({
        error: 'Missing or invalid API key',
        code: 'INVALID_API_KEY'
    });
}

/**
 * Check API key middleware
 * Validates the x-api-key header against the database
 */
async function checkApiKey(req, res, next) {
    // Get API key from header
    const apiKey = req.header('x-api-key');
    if (!apiKey) return sendApiKeyError(res);

    // Get user ID from API key
    const [ok, user_id] = await db_getUserIdFromApiKey(apiKey);
    if (!ok) return sendApiKeyError(res);

    // Attach user info to request
    req.apiUser = { user_id };

    // Continue
    return next();
}

// Exports
module.exports = {
    checkApiKey
};