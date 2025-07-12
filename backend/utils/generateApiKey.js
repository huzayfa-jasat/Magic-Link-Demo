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
 * Generate an array of unique API keys
 * @param {number} count - Number of API keys to generate
 * @returns {string[]} Array of API keys
 */
function generateApiKeys(count = 10) {
    const apiKeys = [];
    for (let i = 0; i < count; i++) {
        apiKeys.push(generateApiKey());
    }
    return apiKeys;
}

module.exports = {
    generateApiKey,
    generateApiKeys
}; 