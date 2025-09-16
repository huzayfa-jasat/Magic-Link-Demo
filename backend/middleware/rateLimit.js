const { rateLimit, metrics } = require('../config/redis');

const RATE_LIMITS = {
    'magic-link': {
        windowSecs: 60,
        maxRequests: 5
    },
    'verify': {
        windowSecs: 60,
        maxRequests: 10
    },
    'refresh': {
        windowSecs: 60,
        maxRequests: 20
    }
};

async function rateLimitMiddleware(type) {
    return async (req, res, next) => {
        try {
            const identifier = req.ip;
            const emailIdentifier = req.body.email;
            
            const limits = RATE_LIMITS[type];
            if (!limits) {
                return next();
            }

            // Check IP-based rate limit
            const ipKey = rateLimit.getKey(type, identifier);
            const ipCount = await rateLimit.increment(ipKey, limits.windowSecs);
            
            // Check email-based rate limit if email is provided
            let emailCount = 0;
            if (emailIdentifier) {
                const emailKey = rateLimit.getKey(`${type}:email`, emailIdentifier);
                emailCount = await rateLimit.increment(emailKey, limits.windowSecs);
            }

            // Check if either limit is exceeded
            if (ipCount > limits.maxRequests || (emailIdentifier && emailCount > limits.maxRequests)) {
                await metrics.incrementCounter('rate_limit_exceeded');
                return res.status(429).json({
                    error: 'Too many requests',
                    retryAfter: limits.windowSecs
                });
            }

            next();
        } catch (error) {
            console.error('Rate limit error:', error);
            next(); // Fail open to prevent rate limiting from breaking the app
        }
    };
}

module.exports = rateLimitMiddleware; 