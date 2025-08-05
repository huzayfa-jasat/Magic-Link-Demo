// Dependencies
const fetch = require('node-fetch');

// Main Class
class BouncerAPI {
    constructor() {
        this.deliverableApiKey = process.env.BOUNCER_API_KEY_NORMAL;
        this.catchallApiKey = process.env.BOUNCER_API_KEY_DEEPCATCHALL;
        this.baseUrl = 'https://api.usebouncer.com';
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

    /**
     * Create a deliverability verification batch
     * @param {Array} emails - Array of pre-validated emails
     * @returns {Promise<string>} - Returns the batch ID from Bouncer API
     */
    async createDeliverabilityBatch(emails) {
		/// Validate params & keys
        if (!Array.isArray(emails) || emails.length === 0) throw new Error('emails must be a non-empty array');
        if (!this.deliverableApiKey) throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');

		// Construct request body
		const requestBody = emails.map(email => ({ email }));

		// Make request
        const response = await this.makeHttpRequest('/v1.1/email/verify/batch', {
            method: 'POST',
            body: requestBody,
            apiKey: this.deliverableApiKey
        });
        if (!response.batchId) throw new Error('Invalid response from Bouncer API: missing batchId');

		// Return new batch ID
        return response.batchId;
    }

    /**
     * Create a catchall verification batch
     * @param {Array} emails - Array of pre-validated emails
     * @returns {Promise<string>} - Returns the batch ID from Bouncer API
     */
    async createCatchallBatch(emails) {
		/// Validate params & keys
        if (!Array.isArray(emails) || emails.length === 0) throw new Error('emails must be a non-empty array');
        if (!this.catchallApiKey) throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');

		// Construct request body
		const requestBody = emails.map(email => ({ email }));

		// Make request
        const response = await this.makeHttpRequest('/v1.1/email/verify/batch', {
            method: 'POST',
            body: requestBody,
            apiKey: this.catchallApiKey
        });
        if (!response.batchId) throw new Error('Invalid response from Bouncer API: missing batchId');

		// Return new batch ID
        return response.batchId;
    }

    /**
     * Check status and results of a deliverability batch
     * @param {string} batchId - The batch ID returned from createDeliverabilityBatch
     * @returns {Promise<Object>} - Returns object with completed status and processed count
     */
    async checkDeliverabilityBatch(batchId) {
		/// Validate params & keys
        if (!batchId || typeof batchId !== 'string') throw new Error('batchId must be a non-empty string');
        if (!this.deliverableApiKey) throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');

		// Make request
        const response = await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}?with-stats=true`, {
            method: 'GET',
            apiKey: this.deliverableApiKey
        });

		// Return status and processed count
        return {
            isCompleted: response.status === 'completed',
            processed: response.processed || 0
        };
    }

    /**
     * Retrieve results of a completed deliverability batch
     * @param {string} batchId - The batch ID returned from createDeliverabilityBatch
     * @returns {Promise<Array>} - Returns array of verification results
     */
    async getDeliverabilityResults(batchId) {
		/// Validate params & keys
        if (!batchId || typeof batchId !== 'string') throw new Error('batchId must be a non-empty string');
        if (!this.deliverableApiKey) throw new Error('BOUNCER_API_KEY_NORMAL environment variable is required');

		// Make request
        const response = await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}/download?download=all`, {
            method: 'GET',
            apiKey: this.deliverableApiKey
        });

		// Format & return results
		return response.map(result => ({
			email: result.email,
			status: result.status,
			reason: result.reason,
			is_catchall: result.domain.acceptAll,
            score: result.score,
            provider: result.provider,
		}));
    }

    /**
     * Check status and results of a catchall batch
     * @param {string} batchId - The batch ID returned from createCatchallBatch
     * @returns {Promise<boolean>} - Returns true if batch is completed, false if still processing
     */
    async checkCatchallBatch(batchId) {
		/// Validate params & keys
        if (!batchId || typeof batchId !== 'string') throw new Error('batchId must be a non-empty string');
        if (!this.catchallApiKey) throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');

		// // Make request
        // const response = await this.makeHttpRequest(`/v1/toxicity/list/${batchId}`, {
        //     method: 'GET',
        //     apiKey: this.catchallApiKey
        // });

		// // Return status
        // return response.status === 'completed';

		// Make request
        const response = await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}?with-stats=true`, {
            method: 'GET',
            apiKey: this.catchallApiKey
        });

		// Return status and processed count
        console.log("PROCESSED COUNT = ", response);
        return {
            isCompleted: response.status === 'completed',
            processed: response.processed || 0
        };
    }

    /**
     * Retrieve results of a completed catchall batch
     * @param {string} batchId - The batch ID returned from createCatchallBatch
     * @returns {Promise<Array>} - Returns array of toxicity results
     */
    async getCatchallResults(batchId) {
		/// Validate params & keys
        if (!batchId || typeof batchId !== 'string') throw new Error('batchId must be a non-empty string');
        if (!this.catchallApiKey) throw new Error('BOUNCER_API_KEY_DEEPCATCHALL environment variable is required');

		// // Make request
        // const response = await this.makeHttpRequest(`/v1/toxicity/list/${batchId}/data`, {
        //     method: 'GET',
        //     apiKey: this.catchallApiKey
        // });

		// // Format & return results
		// return response.map(result => ({
		// 	email: result.email,
		// 	toxicity: result.toxicity,
		// }));

		// Make request
        const response = await this.makeHttpRequest(`/v1.1/email/verify/batch/${batchId}/download?download=all`, {
            method: 'GET',
            apiKey: this.catchallApiKey
        });

		// Format & return results
		return response.map(result => ({
			email: result.email,
			status: result.status,
			reason: result.reason,
			is_catchall: result.domain.acceptAll,
            score: result.score,
            provider: result.provider,
		}));
    }
}

module.exports = BouncerAPI;