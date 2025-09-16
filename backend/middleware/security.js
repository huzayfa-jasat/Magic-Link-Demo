const helmet = require('helmet');

/**
 * Security headers middleware configuration
 */
function securityMiddleware() {
    return helmet({
        // Content Security Policy
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for frontend
                scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for frontend
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        
        // HTTP Strict Transport Security
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        
        // X-Frame-Options
        frameguard: { action: 'deny' },
        
        // X-Content-Type-Options
        noSniff: true,
        
        // X-XSS-Protection
        xssFilter: true,
        
        // Referrer Policy
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        
        // Hide X-Powered-By header
        hidePoweredBy: true,
        
        // DNS Prefetch Control
        dnsPrefetchControl: { allow: false },
        
        // IE No Open
        ieNoOpen: true,
        
        // Permissions Policy (formerly Feature Policy)
        permissionsPolicy: {
            camera: [],
            microphone: [],
            geolocation: [],
            payment: [],
            usb: [],
            magnetometer: [],
            gyroscope: [],
            accelerometer: [],
            ambientLightSensor: [],
            autoplay: [],
            battery: [],
            fullscreen: ["'self'"],
            pictureInPicture: [],
            syncXhr: []
        }
    });
}

/**
 * CORS configuration for production vs development
 */
function corsConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedOrigins = isProduction 
        ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
        : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
    
    return {
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) return callback(null, true);
            
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type', 
            'Authorization', 
            'X-Requested-With',
            'X-Idempotency-Key',
            'Accept',
            'Origin'
        ],
        exposedHeaders: ['X-Request-ID'],
        credentials: true,
        optionsSuccessStatus: 200,
        maxAge: 86400 // 24 hours
    };
}

/**
 * Content-Type validation middleware
 */
function contentTypeValidation(req, res, next) {
    // Skip validation for GET requests and OPTIONS
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return next();
    }
    
    // For POST/PUT/PATCH requests, require proper Content-Type
    const contentType = req.headers['content-type'];
    
    if (!contentType) {
        return res.status(400).json({
            error: 'Content-Type header is required',
            timestamp: new Date().toISOString()
        });
    }
    
    // Validate Content-Type for JSON endpoints
    if (req.path.includes('/api/') && !contentType.includes('application/json')) {
        return res.status(415).json({
            error: 'Content-Type must be application/json for API endpoints',
            timestamp: new Date().toISOString()
        });
    }
    
    next();
}

/**
 * Request ID middleware for tracking
 */
function requestIdMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] || 
                     req.headers['x-correlation-id'] || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId;
    res.set('X-Request-ID', requestId);
    next();
}

module.exports = {
    securityMiddleware,
    corsConfig,
    contentTypeValidation,
    requestIdMiddleware
};
