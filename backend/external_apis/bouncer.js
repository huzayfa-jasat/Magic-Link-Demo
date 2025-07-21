const fetch = require('node-fetch');

/**
 * Bouncer API Integration - Pseudocode Implementation
 * 
 * This module provides four core functions for interacting with the Bouncer API:
 * 1. createDeliverabilityBatch - Submit emails for deliverability verification
 * 2. createCatchallBatch - Submit emails for catchall verification  
 * 3. checkDeliverabilityBatch - Poll for deliverability batch results
 * 4. checkCatchallBatch - Poll for catchall batch results
 * 
 * All functions use a common HTTP wrapper with proper authentication and error handling.
 */

class BouncerAPI {
    constructor() {
        this.normalApiKey = process.env.BOUNCER_API_KEY_NORMAL;
        this.deepCatchallApiKey = process.env.BOUNCER_API_KEY_DEEPCATCHALL;
        this.baseUrl = 'https://api.usebouncer.com';
    }

    /**
     * Create a deliverability verification batch
     * @param {Array} emails - Array of pre-validated email objects [{email: 'test@example.com', name: 'Test User'}, ...]
     * @returns {Promise<string>} - Returns the batch ID from Bouncer API
     */
    async createDeliverabilityBatch(emails) {
        if (!Array.isArray(emails) || emails.length === 0) {
            throw new Error('emails must be a non-empty array');
        }

        if (!this.normalApiKey) {
            throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');
        }

        const response = await this.makeHttpRequest('/v1.1/email/verify/batch', {
            method: 'POST',
            body: emails,
            apiKey: this.normalApiKey
        });

        if (!response.requestId) {
            throw new Error('Invalid response from Bouncer API: missing requestId');
        }

        return response.requestId;
    }

    /**
     * Create a catchall verification batch
     * @param {Array} emails - Array of pre-validated email objects [{email: 'test@example.com', name: 'Test User'}, ...]
     * @returns {Promise<string>} - Returns the batch ID from Bouncer API
     */
    async createCatchallBatch(emails) {
        if (!Array.isArray(emails) || emails.length === 0) {
            throw new Error('emails must be a non-empty array');
        }

        if (!this.deepCatchallApiKey) {
            throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');
        }

        // Extract just the email addresses for the toxicity API (it expects an array of strings, not objects)
        const emailAddresses = emails.map(emailObj => emailObj.email || emailObj);

        const response = await this.makeHttpRequest('/v1/toxicity/list', {
            method: 'POST',
            body: emailAddresses,
            apiKey: this.deepCatchallApiKey
        });

        if (!response.id) {
            throw new Error('Invalid response from Bouncer API: missing id');
        }

        return response.id;
    }

    /**
     * Check status and results of a deliverability batch
     * @param {string} batchId - The batch ID returned from createDeliverabilityBatch
     * @returns {Promise<boolean>} - Returns true if batch is completed, false if still processing
     */
    async checkDeliverabilityBatch(batchId) {
        if (!batchId || typeof batchId !== 'string') {
            throw new Error('batchId must be a non-empty string');
        }

        if (!this.normalApiKey) {
            throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');
        }

        const response = await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}`, {
            method: 'GET',
            apiKey: this.normalApiKey
        });

        return response.status === 'completed';
    }

    /**
     * Retrieve results of a completed deliverability batch
     * @param {string} batchId - The batch ID returned from createDeliverabilityBatch
     * @returns {Promise<Array>} - Returns array of verification results
     */
    async getDeliverabilityResults(batchId) {
        if (!batchId || typeof batchId !== 'string') {
            throw new Error('batchId must be a non-empty string');
        }

        if (!this.normalApiKey) {
            throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');
        }

        return await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}/download?download=all`, {
            method: 'GET',
            apiKey: this.normalApiKey
        });
    }

    /**
     * Check status and results of a catchall batch
     * @param {string} batchId - The batch ID returned from createCatchallBatch
     * @returns {Promise<boolean>} - Returns true if batch is completed, false if still processing
     */
    async checkCatchallBatch(batchId) {
        if (!batchId || typeof batchId !== 'string') {
            throw new Error('batchId must be a non-empty string');
        }

        if (!this.deepCatchallApiKey) {
            throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');
        }

        const response = await this.makeHttpRequest(`/v1/toxicity/list/${batchId}`, {
            method: 'GET',
            apiKey: this.deepCatchallApiKey
        });

        return response.status === 'completed';
    }

    /**
     * Retrieve results of a completed catchall batch
     * @param {string} batchId - The batch ID returned from createCatchallBatch
     * @returns {Promise<Array>} - Returns array of toxicity results
     */
    async getCatchallResults(batchId) {
        if (!batchId || typeof batchId !== 'string') {
            throw new Error('batchId must be a non-empty string');
        }

        if (!this.deepCatchallApiKey) {
            throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');
        }

        return await this.makeHttpRequest(`/v1/toxicity/list/${batchId}/data`, {
            method: 'GET',
            apiKey: this.deepCatchallApiKey
        });
    }

    /**
     * Common HTTP request wrapper with authentication and error handling
     * @param {string} endpoint - API endpoint (e.g., '/v1.1/email/verify/batch', '/v1/toxicity/list')
     * @param {Object} options - HTTP options (method, body, headers, apiKey)
     * @returns {Promise<Object>} - Returns parsed JSON response
     */
    async makeHttpRequest(endpoint, options = {}) {
        const {
            method = 'GET',
            body,
            apiKey,
            ...otherOptions
        } = options;

        const url = `${this.baseUrl}${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': apiKey,
            ...otherOptions.headers
        };

        const requestOptions = {
            method,
            headers,
            ...otherOptions
        };

        if (body && method !== 'GET') {
            requestOptions.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, requestOptions);

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                
                try {
                    const errorBody = await response.json();
                    errorMessage = errorBody.message || errorBody.error || errorMessage;
                } catch (e) {
                    // If we can't parse error body, use status text
                }

                const error = new Error(errorMessage);
                error.status = response.status;
                error.statusText = response.statusText;

                switch (response.status) {
                    case 401:
                        error.message = 'Invalid API key - check your authentication credentials';
                        break;
                    case 402:
                        error.message = 'Insufficient credits - purchase more credits to continue';
                        break;
                    case 429:
                        error.message = 'Rate limit exceeded - please wait before making more requests';
                        break;
                    case 503:
                        error.message = 'Service temporarily unavailable - please retry';
                        break;
                }

                throw error;
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error(`Network error: Unable to connect to Bouncer API at ${url}`);
            }
            throw error;
        }
    }
}

module.exports = BouncerAPI;

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. API ENDPOINTS IMPLEMENTED:
 *    - Deliverability batch creation: POST /v1.1/email/verify/batch
 *    - Deliverability batch status: GET /v1.1/email/verify/batch/{batchId}
 *    - Deliverability batch results: GET /v1.1/email/verify/batch/{batchId}/download
 *    - Catchall batch creation: POST /v1/toxicity/list
 *    - Catchall batch status: GET /v1/toxicity/list/{id}
 *    - Catchall batch results: GET /v1/toxicity/list/{id}/data
 * 
 * 2. AUTHENTICATION:
 *    - Uses x-api-key header authentication
 *    - BOUNCER_API_KEY_NORMAL for deliverability functions
 *    - BOUNCER_API_KEY_DEEPCATCHALL for catchall functions
 * 
 * 3. REQUEST FORMATS:
 *    - Deliverability: Array of objects [{ email: 'test@example.com', name: 'Test User' }]
 *    - Catchall: Array of email strings ['test@example.com', 'test2@example.com']
 * 
 * 4. RESPONSE FORMATS:
 *    - Deliverability batch creation: { requestId: 'abc123', ... }
 *    - Catchall batch creation: { id: 'abc123', ... }
 *    - Status checks: { status: 'completed'|'processing'|'failed', ... }
 * 
 * 5. ERROR HANDLING:
 *    - 401: Invalid API key
 *    - 402: Insufficient credits
 *    - 429: Rate limit exceeded
 *    - 503: Service temporarily unavailable
 *    - Network errors handled with descriptive messages
 * 
 * 6. USAGE:
 *    - createDeliverabilityBatch(emails) -> returns requestId
 *    - checkDeliverabilityBatch(batchId) -> returns boolean (completed)
 *    - getDeliverabilityResults(batchId) -> returns results array
 *    - createCatchallBatch(emails) -> returns id
 *    - checkCatchallBatch(batchId) -> returns boolean (completed)
 *    - getCatchallResults(batchId) -> returns results array
 */