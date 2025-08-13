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
    req.user = { id: user_id };

    // Continue
    return next();
}

/**
 * Map 'id' parameter to 'batchId' for middleware compatibility
 */
async function mapIdToBatchId(req, res, next) {
    if (req.params.id) {
        req.params.batchId = req.params.id;
    }
    next();
}

/**
 * Validate email limit middleware
 * Ensures no more than 10,000 emails per request
 */
function validateEmailLimit(req, res, next) {
    const { emails } = req.body;
    
    if (emails && Array.isArray(emails) && emails.length > 10000) {
        return res.status(HttpStatus.BAD_REQUEST_STATUS).json({ 
            error: 'Maximum 10,000 emails allowed per request' 
        });
    }
    
    next();
}

// Exports
module.exports = {
    checkApiKey,
    mapIdToBatchId,
    validateEmailLimit
};