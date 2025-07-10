const crypto = require('crypto');

/**
 * Generate a secure API key with high entropy
 * @returns {string} A 64-character secure API key
 */
function generateApiKey() {
    // Generate 32 random bytes and convert to hex string (64 characters)
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a new API key and ensure it's unique in the database
 * @param {Object} knex - Knex database instance
 * @returns {Promise<string>} A unique API key
 */
async function generateUniqueApiKey(knex) {
    let apiKey;
    let isUnique = false;
    
    while (!isUnique) {
        apiKey = generateApiKey();
        
        // Check if this API key already exists
        const existing = await knex('Users')
            .where('api_key', apiKey)
            .first();
            
        if (!existing) {
            isUnique = true;
        }
    }
    
    return apiKey;
}

module.exports = {
    generateApiKey,
    generateUniqueApiKey
}; 