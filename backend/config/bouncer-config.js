const mysql = require('mysql2/promise');

/**
 * Bouncer Email Verification System Configuration
 * 
 * This module provides centralized configuration management for the Bouncer email verification system.
 * It handles environment variables, default values, validation, and exports all Bouncer-related configuration.
 */

class BouncerConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BouncerConfigError';
    }
}

/**
 * Environment variable validation with type checking
 */
function validateEnvVar(name, value, type = 'string', required = true) {
    if (required && (value === undefined || value === null || value === '')) {
        throw new BouncerConfigError(`Required environment variable ${name} is missing or empty`);
    }
    
    if (value === undefined || value === null) {
        return null;
    }
    
    switch (type) {
        case 'number':
            const num = parseInt(value, 10);
            if (isNaN(num)) {
                throw new BouncerConfigError(`Environment variable ${name} must be a valid number, got: ${value}`);
            }
            return num;
        case 'boolean':
            if (typeof value === 'boolean') return value;
            if (value.toLowerCase() === 'true') return true;
            if (value.toLowerCase() === 'false') return false;
            throw new BouncerConfigError(`Environment variable ${name} must be a boolean (true/false), got: ${value}`);
        case 'url':
            try {
                new URL(value);
                return value;
            } catch (error) {
                throw new BouncerConfigError(`Environment variable ${name} must be a valid URL, got: ${value}`);
            }
        case 'string':
        default:
            return value;
    }
}

/**
 * Redis Configuration
 */
const redis = {
    host: validateEnvVar('REDIS_HOST', process.env.REDIS_HOST, 'string', false) || 'localhost',
    port: validateEnvVar('REDIS_PORT', process.env.REDIS_PORT, 'number', false) || 6379,
    password: validateEnvVar('REDIS_PASSWORD', process.env.REDIS_PASSWORD, 'string', false),
    db: validateEnvVar('REDIS_DB', process.env.REDIS_DB, 'number', false) || 0,
    maxRetriesPerRequest: validateEnvVar('REDIS_MAX_RETRIES', process.env.REDIS_MAX_RETRIES, 'number', false) || 3,
    lazyConnect: validateEnvVar('REDIS_LAZY_CONNECT', process.env.REDIS_LAZY_CONNECT, 'boolean', false) || true,
    retryDelayOnFailover: validateEnvVar('REDIS_RETRY_DELAY', process.env.REDIS_RETRY_DELAY, 'number', false) || 100,
    enableOfflineQueue: validateEnvVar('REDIS_OFFLINE_QUEUE', process.env.REDIS_OFFLINE_QUEUE, 'boolean', false) || false,
    connectTimeout: validateEnvVar('REDIS_CONNECT_TIMEOUT', process.env.REDIS_CONNECT_TIMEOUT, 'number', false) || 30000,
    commandTimeout: validateEnvVar('REDIS_COMMAND_TIMEOUT', process.env.REDIS_COMMAND_TIMEOUT, 'number', false) || 5000,
    keyPrefix: validateEnvVar('REDIS_KEY_PREFIX', process.env.REDIS_KEY_PREFIX, 'string', false) || 'bouncer:'
};

/**
 * Bouncer API Configuration
 */
const api = {
    // Primary API key for normal verification
    keyNormal: validateEnvVar('BOUNCER_API_KEY_NORMAL', process.env.BOUNCER_API_KEY_NORMAL, 'string', true),
    
    // Deep catch-all API key for enhanced verification
    keyDeepCatchall: validateEnvVar('BOUNCER_API_KEY_DEEPCATCHALL', process.env.BOUNCER_API_KEY_DEEPCATCHALL, 'string', true),
    
    // Base URL for Bouncer API
    baseUrl: validateEnvVar('BOUNCER_API_BASE_URL', process.env.BOUNCER_API_BASE_URL, 'url', false) || 'https://api.usebouncer.com/v1.1',
    
    // API timeout settings
    timeout: validateEnvVar('BOUNCER_API_TIMEOUT', process.env.BOUNCER_API_TIMEOUT, 'number', false) || 30000,
    
    // Retry configuration
    maxRetries: validateEnvVar('BOUNCER_API_MAX_RETRIES', process.env.BOUNCER_API_MAX_RETRIES, 'number', false) || 3,
    retryDelay: validateEnvVar('BOUNCER_API_RETRY_DELAY', process.env.BOUNCER_API_RETRY_DELAY, 'number', false) || 1000,
    
    // Circuit breaker configuration
    circuitBreakerFailureThreshold: validateEnvVar('BOUNCER_CIRCUIT_BREAKER_FAILURES', process.env.BOUNCER_CIRCUIT_BREAKER_FAILURES, 'number', false) || 5,
    circuitBreakerRecoveryTimeout: validateEnvVar('BOUNCER_CIRCUIT_BREAKER_RECOVERY', process.env.BOUNCER_CIRCUIT_BREAKER_RECOVERY, 'number', false) || 60000,
    
    // User agent for API requests
    userAgent: validateEnvVar('BOUNCER_USER_AGENT', process.env.BOUNCER_USER_AGENT, 'string', false) || 'OmniVerifier/1.0'
};

/**
 * Queue Configuration
 */
const queue = {
    // Maximum number of concurrent batches
    maxConcurrentBatches: validateEnvVar('MAX_CONCURRENT_BATCHES', process.env.MAX_CONCURRENT_BATCHES, 'number', false) || 15,
    
    // Batch size configuration
    batchSize: validateEnvVar('BATCH_SIZE', process.env.BATCH_SIZE, 'number', false) || 10000,
    minBatchSize: validateEnvVar('MIN_BATCH_SIZE', process.env.MIN_BATCH_SIZE, 'number', false) || 100,
    
    // Queue concurrency settings
    emailVerificationConcurrency: validateEnvVar('EMAIL_VERIFICATION_CONCURRENCY', process.env.EMAIL_VERIFICATION_CONCURRENCY, 'number', false) || 5,
    batchStatusConcurrency: validateEnvVar('BATCH_STATUS_CONCURRENCY', process.env.BATCH_STATUS_CONCURRENCY, 'number', false) || 10,
    batchDownloadConcurrency: validateEnvVar('BATCH_DOWNLOAD_CONCURRENCY', process.env.BATCH_DOWNLOAD_CONCURRENCY, 'number', false) || 3,
    cleanupConcurrency: validateEnvVar('CLEANUP_CONCURRENCY', process.env.CLEANUP_CONCURRENCY, 'number', false) || 1,
    
    // Job options
    defaultAttempts: validateEnvVar('QUEUE_DEFAULT_ATTEMPTS', process.env.QUEUE_DEFAULT_ATTEMPTS, 'number', false) || 3,
    defaultBackoffDelay: validateEnvVar('QUEUE_DEFAULT_BACKOFF_DELAY', process.env.QUEUE_DEFAULT_BACKOFF_DELAY, 'number', false) || 2000,
    removeOnComplete: validateEnvVar('QUEUE_REMOVE_ON_COMPLETE', process.env.QUEUE_REMOVE_ON_COMPLETE, 'number', false) || 50,
    removeOnFail: validateEnvVar('QUEUE_REMOVE_ON_FAIL', process.env.QUEUE_REMOVE_ON_FAIL, 'number', false) || 100,
    
    // Queue limiter settings
    emailVerificationLimiterMax: validateEnvVar('EMAIL_VERIFICATION_LIMITER_MAX', process.env.EMAIL_VERIFICATION_LIMITER_MAX, 'number', false) || 10,
    emailVerificationLimiterDuration: validateEnvVar('EMAIL_VERIFICATION_LIMITER_DURATION', process.env.EMAIL_VERIFICATION_LIMITER_DURATION, 'number', false) || 60000,
    batchStatusLimiterMax: validateEnvVar('BATCH_STATUS_LIMITER_MAX', process.env.BATCH_STATUS_LIMITER_MAX, 'number', false) || 50,
    batchStatusLimiterDuration: validateEnvVar('BATCH_STATUS_LIMITER_DURATION', process.env.BATCH_STATUS_LIMITER_DURATION, 'number', false) || 60000,
    batchDownloadLimiterMax: validateEnvVar('BATCH_DOWNLOAD_LIMITER_MAX', process.env.BATCH_DOWNLOAD_LIMITER_MAX, 'number', false) || 20,
    batchDownloadLimiterDuration: validateEnvVar('BATCH_DOWNLOAD_LIMITER_DURATION', process.env.BATCH_DOWNLOAD_LIMITER_DURATION, 'number', false) || 60000,
    
    // Queue delays
    batchStatusCheckDelay: validateEnvVar('BATCH_STATUS_CHECK_DELAY', process.env.BATCH_STATUS_CHECK_DELAY, 'number', false) || 30000,
    batchRetryDelay: validateEnvVar('BATCH_RETRY_DELAY', process.env.BATCH_RETRY_DELAY, 'number', false) || 60000,
    rateLimitRetryDelay: validateEnvVar('RATE_LIMIT_RETRY_DELAY', process.env.RATE_LIMIT_RETRY_DELAY, 'number', false) || 60000
};

/**
 * Rate Limiting Configuration
 */
const rateLimiting = {
    // Rate limit per minute (conservative with buffer)
    maxRequestsPerMinute: validateEnvVar('RATE_LIMIT_PER_MINUTE', process.env.RATE_LIMIT_PER_MINUTE, 'number', false) || 180,
    
    // Rate limiting window size in milliseconds
    windowSizeMs: validateEnvVar('RATE_LIMIT_WINDOW_MS', process.env.RATE_LIMIT_WINDOW_MS, 'number', false) || 60000,
    
    // Buffer for safety (requests to keep in reserve)
    safetyBuffer: validateEnvVar('RATE_LIMIT_SAFETY_BUFFER', process.env.RATE_LIMIT_SAFETY_BUFFER, 'number', false) || 20,
    
    // Cleanup interval for old rate limit records
    cleanupIntervalMs: validateEnvVar('RATE_LIMIT_CLEANUP_INTERVAL', process.env.RATE_LIMIT_CLEANUP_INTERVAL, 'number', false) || 300000, // 5 minutes
    
    // How long to keep rate limit records
    recordRetentionMs: validateEnvVar('RATE_LIMIT_RECORD_RETENTION', process.env.RATE_LIMIT_RECORD_RETENTION, 'number', false) || 3600000 // 1 hour
};

/**
 * Database Configuration
 */
const database = {
    // MySQL connection settings
    host: validateEnvVar('MYSQL_HOST', process.env.MYSQL_HOST, 'string', false) || 'dbserver',
    user: validateEnvVar('MYSQL_USER', process.env.MYSQL_USER, 'string', false) || 'root',
    password: validateEnvVar('MYSQL_PASSWORD', process.env.MYSQL_PASSWORD, 'string', false),
    database: validateEnvVar('MYSQL_DATABASE', process.env.MYSQL_DATABASE, 'string', false) || 'omniverifier',
    port: validateEnvVar('MYSQL_PORT', process.env.MYSQL_PORT, 'number', false) || 3306,
    
    // Connection pool settings
    connectionLimit: validateEnvVar('MYSQL_CONNECTION_LIMIT', process.env.MYSQL_CONNECTION_LIMIT, 'number', false) || 10,
    acquireTimeout: validateEnvVar('MYSQL_ACQUIRE_TIMEOUT', process.env.MYSQL_ACQUIRE_TIMEOUT, 'number', false) || 60000,
    timeout: validateEnvVar('MYSQL_TIMEOUT', process.env.MYSQL_TIMEOUT, 'number', false) || 60000,
    
    // Reconnection settings
    reconnect: validateEnvVar('MYSQL_RECONNECT', process.env.MYSQL_RECONNECT, 'boolean', false) || true,
    
    // SSL configuration
    ssl: validateEnvVar('MYSQL_SSL', process.env.MYSQL_SSL, 'boolean', false) || false,
    
    // Charset and timezone
    charset: validateEnvVar('MYSQL_CHARSET', process.env.MYSQL_CHARSET, 'string', false) || 'utf8mb4',
    timezone: validateEnvVar('MYSQL_TIMEZONE', process.env.MYSQL_TIMEZONE, 'string', false) || 'UTC'
};

/**
 * Monitoring and Health Configuration
 */
const monitoring = {
    // Health check interval
    healthCheckInterval: validateEnvVar('HEALTH_CHECK_INTERVAL', process.env.HEALTH_CHECK_INTERVAL, 'number', false) || 300000, // 5 minutes
    
    // Metrics collection interval
    metricsInterval: validateEnvVar('METRICS_INTERVAL', process.env.METRICS_INTERVAL, 'number', false) || 60000, // 1 minute
    
    // Dead letter queue threshold
    deadLetterQueueThreshold: validateEnvVar('DEAD_LETTER_QUEUE_THRESHOLD', process.env.DEAD_LETTER_QUEUE_THRESHOLD, 'number', false) || 10,
    
    // Alert thresholds
    alertThresholds: {
        queueBacklog: validateEnvVar('ALERT_QUEUE_BACKLOG', process.env.ALERT_QUEUE_BACKLOG, 'number', false) || 100000,
        errorRate: validateEnvVar('ALERT_ERROR_RATE', process.env.ALERT_ERROR_RATE, 'number', false) || 5,
        rateLimitUtilization: validateEnvVar('ALERT_RATE_LIMIT_UTILIZATION', process.env.ALERT_RATE_LIMIT_UTILIZATION, 'number', false) || 90,
        apiResponseTime: validateEnvVar('ALERT_API_RESPONSE_TIME', process.env.ALERT_API_RESPONSE_TIME, 'number', false) || 5000,
        workerFailures: validateEnvVar('ALERT_WORKER_FAILURES', process.env.ALERT_WORKER_FAILURES, 'number', false) || 10
    }
};

/**
 * Optimization Configuration
 */
const optimization = {
    // Batch composition optimization
    enableBatchOptimization: validateEnvVar('ENABLE_BATCH_OPTIMIZATION', process.env.ENABLE_BATCH_OPTIMIZATION, 'boolean', false) || true,
    
    // Domain diversity settings
    maxEmailsPerDomain: validateEnvVar('MAX_EMAILS_PER_DOMAIN', process.env.MAX_EMAILS_PER_DOMAIN, 'number', false) || 1000,
    
    // Multi-layer verification
    enableMultiLayerVerification: validateEnvVar('ENABLE_MULTI_LAYER_VERIFICATION', process.env.ENABLE_MULTI_LAYER_VERIFICATION, 'boolean', false) || true,
    deepCatchallThreshold: validateEnvVar('DEEP_CATCHALL_THRESHOLD', process.env.DEEP_CATCHALL_THRESHOLD, 'number', false) || 70,
    
    // Caching settings
    enableResultCaching: validateEnvVar('ENABLE_RESULT_CACHING', process.env.ENABLE_RESULT_CACHING, 'boolean', false) || true,
    cacheExpirationHours: validateEnvVar('CACHE_EXPIRATION_HOURS', process.env.CACHE_EXPIRATION_HOURS, 'number', false) || 24
};

/**
 * Security Configuration
 */
const security = {
    // API key rotation settings
    enableApiKeyRotation: validateEnvVar('ENABLE_API_KEY_ROTATION', process.env.ENABLE_API_KEY_ROTATION, 'boolean', false) || false,
    apiKeyRotationInterval: validateEnvVar('API_KEY_ROTATION_INTERVAL', process.env.API_KEY_ROTATION_INTERVAL, 'number', false) || 2592000000, // 30 days
    
    // Input validation settings
    maxEmailLength: validateEnvVar('MAX_EMAIL_LENGTH', process.env.MAX_EMAIL_LENGTH, 'number', false) || 320,
    enableEmailValidation: validateEnvVar('ENABLE_EMAIL_VALIDATION', process.env.ENABLE_EMAIL_VALIDATION, 'boolean', false) || true,
    
    // Rate limiting for abuse prevention
    enableAbuseProtection: validateEnvVar('ENABLE_ABUSE_PROTECTION', process.env.ENABLE_ABUSE_PROTECTION, 'boolean', false) || true,
    maxRequestsPerUser: validateEnvVar('MAX_REQUESTS_PER_USER', process.env.MAX_REQUESTS_PER_USER, 'number', false) || 10000,
    
    // Error message sanitization
    sanitizeErrorMessages: validateEnvVar('SANITIZE_ERROR_MESSAGES', process.env.SANITIZE_ERROR_MESSAGES, 'boolean', false) || true
};

/**
 * Development and Testing Configuration
 */
const development = {
    // Enable debug logging
    enableDebugLogging: validateEnvVar('ENABLE_DEBUG_LOGGING', process.env.ENABLE_DEBUG_LOGGING, 'boolean', false) || (process.env.NODE_ENV === 'development'),
    
    // Mock API responses in development
    useMockApi: validateEnvVar('USE_MOCK_API', process.env.USE_MOCK_API, 'boolean', false) || false,
    
    // Disable rate limiting in development
    disableRateLimiting: validateEnvVar('DISABLE_RATE_LIMITING', process.env.DISABLE_RATE_LIMITING, 'boolean', false) || false,
    
    // Test mode settings
    testMode: validateEnvVar('TEST_MODE', process.env.TEST_MODE, 'boolean', false) || false,
    testBatchSize: validateEnvVar('TEST_BATCH_SIZE', process.env.TEST_BATCH_SIZE, 'number', false) || 10
};

/**
 * Validate configuration at startup
 */
function validateConfiguration() {
    const errors = [];
    
    // Validate Redis configuration
    if (!redis.host) {
        errors.push('Redis host is required');
    }
    
    if (redis.port < 1 || redis.port > 65535) {
        errors.push('Redis port must be between 1 and 65535');
    }
    
    // Validate API configuration
    if (!api.keyNormal) {
        errors.push('Normal Bouncer API key is required');
    }
    
    if (!api.keyDeepCatchall) {
        errors.push('Deep catch-all Bouncer API key is required');
    }
    
    if (api.timeout < 1000) {
        errors.push('API timeout must be at least 1000ms');
    }
    
    // Validate queue configuration
    if (queue.maxConcurrentBatches < 1) {
        errors.push('Maximum concurrent batches must be at least 1');
    }
    
    if (queue.batchSize < 1) {
        errors.push('Batch size must be at least 1');
    }
    
    if (queue.batchSize > 10000) {
        errors.push('Batch size cannot exceed 10000');
    }
    
    // Validate rate limiting configuration
    if (rateLimiting.maxRequestsPerMinute < 1) {
        errors.push('Rate limit must be at least 1 request per minute');
    }
    
    if (rateLimiting.windowSizeMs < 1000) {
        errors.push('Rate limit window must be at least 1000ms');
    }
    
    // Validate database configuration
    if (!database.host) {
        errors.push('Database host is required');
    }
    
    if (!database.user) {
        errors.push('Database user is required');
    }
    
    if (!database.database) {
        errors.push('Database name is required');
    }
    
    if (errors.length > 0) {
        throw new BouncerConfigError(`Configuration validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Get database connection configuration for knex or mysql2
 */
function getDatabaseConfig() {
    return {
        host: database.host,
        user: database.user,
        password: database.password,
        database: database.database,
        port: database.port,
        ssl: database.ssl,
        charset: database.charset,
        timezone: database.timezone,
        acquireTimeout: database.acquireTimeout,
        timeout: database.timeout,
        reconnect: database.reconnect,
        pool: {
            min: 0,
            max: database.connectionLimit
        }
    };
}

/**
 * Get Redis connection configuration for IORedis
 */
function getRedisConfig() {
    return {
        host: redis.host,
        port: redis.port,
        password: redis.password,
        db: redis.db,
        maxRetriesPerRequest: redis.maxRetriesPerRequest,
        lazyConnect: redis.lazyConnect,
        retryDelayOnFailover: redis.retryDelayOnFailover,
        enableOfflineQueue: redis.enableOfflineQueue,
        connectTimeout: redis.connectTimeout,
        commandTimeout: redis.commandTimeout,
        keyPrefix: redis.keyPrefix
    };
}

/**
 * Get current environment
 */
function getEnvironment() {
    return process.env.NODE_ENV || 'development';
}

/**
 * Check if running in production
 */
function isProduction() {
    return getEnvironment() === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
    return getEnvironment() === 'development';
}

/**
 * Check if running in test mode
 */
function isTestMode() {
    return development.testMode || process.env.NODE_ENV === 'test';
}

// Validate configuration on module load
try {
    validateConfiguration();
} catch (error) {
    console.error('Bouncer configuration validation failed:', error.message);
    if (isProduction()) {
        // In production, fail fast
        process.exit(1);
    } else {
        // In development, log the error but continue
        console.warn('Continuing with invalid configuration in development mode');
    }
}

// Export all configuration
module.exports = {
    // Configuration objects
    redis,
    api,
    queue,
    rateLimiting,
    database,
    monitoring,
    optimization,
    security,
    development,
    
    // Utility functions
    validateConfiguration,
    getDatabaseConfig,
    getRedisConfig,
    getEnvironment,
    isProduction,
    isDevelopment,
    isTestMode,
    
    // Error class
    BouncerConfigError,
    
    // Job types and priorities (for consistency with queue-config.js)
    JOB_TYPES: {
        CREATE_BATCH: 'create-batch',
        CHECK_BATCH_STATUS: 'check-batch-status',
        DOWNLOAD_BATCH_RESULTS: 'download-batch-results',
        CLEANUP_RATE_LIMITS: 'cleanup-rate-limits',
        HEALTH_CHECK: 'health-check',
        RETRY_FAILED_BATCH: 'retry-failed-batch'
    },
    
    PRIORITY: {
        CRITICAL: 100,
        HIGH: 75,
        NORMAL: 50,
        LOW: 25
    }
};