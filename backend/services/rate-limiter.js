const knex = require('knex');
const config = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

class RateLimiter {
    constructor() {
        this.windowSizeMs = 60000; // 1 minute window
        this.maxRequests = 180; // Conservative limit (20 buffer from 200)
    }
    
    async canMakeApiCall() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowSizeMs);
        
        // Count requests in current window
        const currentCount = await db('Bouncer_Rate_Limit')
            .count('* as count')
            .where('window_start_ts', '>=', windowStart)
            .first();
        
        return currentCount.count < this.maxRequests;
    }
    
    async recordApiCall() {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + this.windowSizeMs);
        
        await db('Bouncer_Rate_Limit').insert({
            request_count: 1,
            window_start_ts: now,
            window_end_ts: windowEnd
        });
    }
    
    async getNextAvailableTime() {
        const oldestRequest = await db('Bouncer_Rate_Limit')
            .select('window_start_ts')
            .orderBy('window_start_ts', 'asc')
            .limit(1)
            .offset(this.maxRequests - 1)
            .first();
        
        if (!oldestRequest) {
            return new Date(); // Can make request now
        }
        
        return new Date(oldestRequest.window_start_ts.getTime() + this.windowSizeMs);
    }
    
    async getRateLimitStatus() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowSizeMs);
        
        // Count requests in current window
        const currentCount = await db('Bouncer_Rate_Limit')
            .count('* as count')
            .where('window_start_ts', '>=', windowStart)
            .first();
        
        const requestsMade = parseInt(currentCount.count) || 0;
        const requestsRemaining = Math.max(0, this.maxRequests - requestsMade);
        const canMakeCall = requestsRemaining > 0;
        
        // Calculate when the window resets
        const windowResetTime = new Date(now.getTime() + this.windowSizeMs);
        
        return {
            canMakeCall,
            requestsMade,
            requestsRemaining,
            maxRequests: this.maxRequests,
            windowResetTime,
            utilizationPercentage: Math.round((requestsMade / this.maxRequests) * 100)
        };
    }
    
    async cleanup() {
        // Clean up old rate limit records (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 3600000);
        await db('Bouncer_Rate_Limit')
            .where('window_end_ts', '<', oneHourAgo)
            .del();
    }
}

module.exports = RateLimiter;