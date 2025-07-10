const fetch = require('node-fetch');
const knex = require('knex');
const config = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

class BouncerApiService {
    constructor() {
        this.apiKey = process.env.BOUNCER_API_KEY;
        this.baseUrl = process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1';
        this.maxRetries = 3;
    }
    
    async createBatch(emails, userId, requestId) {
        const batchData = {
            emails: emails.map(email => ({
                email: email.email || email,
                name: email.name || ''
            }))
        };
        
        const response = await this.makeApiCall('/batch', {
            method: 'POST',
            body: JSON.stringify(batchData)
        });
        
        if (!response.ok) {
            throw new Error(`Bouncer API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Store batch information in database
        const batchRecord = await db('Bouncer_Batches').insert({
            batch_id: result.batch_id,
            user_id: userId,
            request_id: requestId,
            status: 'processing',
            quantity: emails.length,
            duplicates: result.duplicates || 0
        });
        
        return {
            id: batchRecord[0],
            batch_id: result.batch_id,
            quantity: emails.length,
            duplicates: result.duplicates || 0
        };
    }
    
    async getBatchStatus(batchId) {
        const response = await this.makeApiCall(`/batch/${batchId}`);
        
        if (!response.ok) {
            throw new Error(`Bouncer API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async downloadBatchResults(batchId) {
        const response = await this.makeApiCall(`/batch/${batchId}/download`);
        
        if (!response.ok) {
            throw new Error(`Bouncer API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async makeApiCall(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        if (options.headers) {
            mergedOptions.headers = { ...defaultOptions.headers, ...options.headers };
        }
        
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, mergedOptions);
                
                // Don't retry on client errors (4xx) except 429 (rate limit)
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    return response;
                }
                
                // Retry on server errors (5xx) and rate limits (429)
                if (response.status >= 500 || response.status === 429) {
                    if (attempt === this.maxRetries) {
                        return response;
                    }
                    
                    // Exponential backoff
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                return response;
            } catch (error) {
                lastError = error;
                
                if (attempt === this.maxRetries) {
                    throw error;
                }
                
                // Exponential backoff for network errors
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }
}

module.exports = BouncerApiService;