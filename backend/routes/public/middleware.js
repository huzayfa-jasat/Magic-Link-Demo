// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const HttpStatus = require('../../types/HttpStatus.js');

/**
 * Check API key middleware
 * Validates the x-api-key header against the database
 */
async function checkApiKey(req, res, next) {
    let err_code;
    const apiKey = req.header('x-api-key');
    
    if (!apiKey) {
        return res.status(HttpStatus.FAILED_STATUS).json({
            error: 'API key required',
            code: 'MISSING_API_KEY'
        });
    }

    // Check if API key exists in database
    const user = await knex('Users')
        .where('api_key', apiKey)
        .select('id', 'email')
        .first()
        .catch((err) => { if (err) err_code = err.code });

    if (err_code || !user) {
        return res.status(HttpStatus.FAILED_STATUS).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY'
        });
    }

    // Attach user info to request for use in controllers
    req.apiUser = {
        id: user.id,
        email: user.email
    };

    return next();
}

module.exports = {
    checkApiKey
}; 