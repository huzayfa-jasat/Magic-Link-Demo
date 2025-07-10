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
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        try {
            apiKey = generateApiKey();
            
            // Check if this API key already exists
            const existing = await knex('Users')
                .where('api_key', apiKey)
                .first();
                
            if (!existing) {
                return apiKey;
            }
            
            attempts++;
        } catch (error) {
            console.error('Error checking API key uniqueness:', error);
            attempts++;
            
            // If we've exhausted all attempts, throw an error
            if (attempts >= maxAttempts) {
                throw new Error('Failed to generate unique API key after maximum attempts');
            }
        }
    }
    
    throw new Error('Failed to generate unique API key after maximum attempts');
}

module.exports = {
    generateApiKey,
    generateUniqueApiKey
}; 