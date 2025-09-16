const Redis = require('ioredis');

// Redis client for rate limiting
const rateLimitClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    keyPrefix: 'rate:',
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// Redis client for token blacklist
const tokenBlacklistClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    keyPrefix: 'blacklist:',
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// Rate limiting functions
const rateLimit = {
    async increment(key, windowSecs) {
        const multi = rateLimitClient.multi();
        multi.incr(key);
        multi.expire(key, windowSecs);
        const results = await multi.exec();
        return results[0][1]; // Return incremented value
    },

    async isOverLimit(key, limit) {
        const count = await rateLimitClient.get(key);
        return count ? parseInt(count) > limit : false;
    },

    getKey(type, identifier) {
        const timestamp = Math.floor(Date.now() / 60000); // Per minute window
        return `${type}:${identifier}:${timestamp}`;
    }
};

// Token blacklist functions
const tokenBlacklist = {
    async add(token, reason = 'revoked', expiresIn = 86400) {
        await tokenBlacklistClient.setex(token, expiresIn, reason);
    },

    async isBlacklisted(token) {
        return await tokenBlacklistClient.exists(token);
    },

    async getReason(token) {
        return await tokenBlacklistClient.get(token);
    }
};

// Metrics tracking
const metrics = {
    async incrementCounter(metric) {
        const key = `metrics:${metric}:${Math.floor(Date.now() / 300000)}`; // 5-minute buckets
        await rateLimitClient.incr(key);
        await rateLimitClient.expire(key, 86400); // Keep for 24 hours
    },

    async getCounterLast24h(metric) {
        const now = Math.floor(Date.now() / 300000);
        const keys = Array.from({length: 288}, (_, i) => `metrics:${metric}:${now - i}`);
        const counts = await rateLimitClient.mget(keys);
        return counts.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
    }
};

module.exports = {
    rateLimitClient,
    tokenBlacklistClient,
    rateLimit,
    tokenBlacklist,
    metrics
}; 