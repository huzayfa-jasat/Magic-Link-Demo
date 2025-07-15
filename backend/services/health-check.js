const mysql = require('mysql2/promise');
const IORedis = require('ioredis');
const axios = require('axios');
const { Queue } = require('bullmq');

class HealthCheckService {
    constructor() {
        this.redisClient = null;
        this.dbPool = null;
        this.queues = {};
        this.initializeConnections();
    }

    /**
     * Initialize Redis and database connections for health checks
     */
    initializeConnections() {
        // Redis connection for health checks
        this.redisClient = new IORedis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            db: 0,
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            enableOfflineQueue: false,
            lazyConnect: true
        });

        // Database connection pool
        this.dbPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'omniverifier',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            acquireTimeout: 60000,
            timeout: 60000
        });

        // Initialize queue connections for monitoring
        this.queues = {
            'email-verification': new Queue('email-verification', { 
                connection: this.redisClient 
            }),
            'batch-status-check': new Queue('batch-status-check', { 
                connection: this.redisClient 
            }),
            'batch-download': new Queue('batch-download', { 
                connection: this.redisClient 
            }),
            'cleanup-tasks': new Queue('cleanup-tasks', { 
                connection: this.redisClient 
            })
        };
    }

    /**
     * Perform comprehensive health check
     * @returns {Object} Health check results
     */
    async performHealthCheck() {
        const startTime = Date.now();
        
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            version: process.env.npm_package_version || '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            checks: {}
        };

        try {
            // Perform all health checks in parallel
            const [
                redisHealth,
                databaseHealth,
                bouncerApiHealth,
                queueStats,
                rateLimitStatus
            ] = await Promise.allSettled([
                this.checkRedisHealth(),
                this.checkDatabaseHealth(),
                this.checkBouncerApiHealth(),
                this.getQueueStats(),
                this.getRateLimitStatus()
            ]);

            // Process Redis health
            if (redisHealth.status === 'fulfilled') {
                health.checks.redis = redisHealth.value;
            } else {
                health.checks.redis = {
                    status: 'unhealthy',
                    error: redisHealth.reason.message,
                    latency: null
                };
                health.status = 'unhealthy';
            }

            // Process Database health
            if (databaseHealth.status === 'fulfilled') {
                health.checks.database = databaseHealth.value;
            } else {
                health.checks.database = {
                    status: 'unhealthy',
                    error: databaseHealth.reason.message,
                    latency: null
                };
                health.status = 'unhealthy';
            }

            // Process Bouncer API health
            if (bouncerApiHealth.status === 'fulfilled') {
                health.checks.bouncer_api = bouncerApiHealth.value;
            } else {
                health.checks.bouncer_api = {
                    status: 'degraded',
                    error: bouncerApiHealth.reason.message,
                    latency: null
                };
                // API issues don't necessarily make the system unhealthy
                if (health.status === 'healthy') {
                    health.status = 'degraded';
                }
            }

            // Process Queue stats
            if (queueStats.status === 'fulfilled') {
                health.checks.queues = queueStats.value;
            } else {
                health.checks.queues = {
                    status: 'unhealthy',
                    error: queueStats.reason.message
                };
                health.status = 'unhealthy';
            }

            // Process Rate limit status
            if (rateLimitStatus.status === 'fulfilled') {
                health.checks.rate_limit = rateLimitStatus.value;
            } else {
                health.checks.rate_limit = {
                    status: 'degraded',
                    error: rateLimitStatus.reason.message
                };
                if (health.status === 'healthy') {
                    health.status = 'degraded';
                }
            }

            // Calculate overall response time
            health.response_time = Date.now() - startTime;

            // Store health metrics
            await this.storeHealthMetrics(health);

            return health;

        } catch (error) {
            console.error('Health check failed:', error);
            return {
                timestamp: new Date().toISOString(),
                status: 'unhealthy',
                error: error.message,
                response_time: Date.now() - startTime,
                checks: {}
            };
        }
    }

    /**
     * Check Redis health and performance
     * @returns {Object} Redis health status
     */
    async checkRedisHealth() {
        const startTime = Date.now();
        
        try {
            // Test basic connectivity
            await this.redisClient.ping();
            
            // Test read/write operations
            const testKey = `health_check_${Date.now()}`;
            const testValue = 'health_check_value';
            
            await this.redisClient.set(testKey, testValue, 'EX', 60);
            const retrievedValue = await this.redisClient.get(testKey);
            await this.redisClient.del(testKey);
            
            if (retrievedValue !== testValue) {
                throw new Error('Redis read/write test failed');
            }

            // Get Redis info
            const info = await this.redisClient.info();
            const memory = await this.redisClient.info('memory');
            
            const latency = Date.now() - startTime;
            
            return {
                status: 'healthy',
                latency,
                connected: true,
                memory_usage: this.parseRedisMemoryInfo(memory),
                server_info: this.parseRedisServerInfo(info)
            };

        } catch (error) {
            console.error('Redis health check failed:', error);
            throw new Error(`Redis health check failed: ${error.message}`);
        }
    }

    /**
     * Check database health and performance
     * @returns {Object} Database health status
     */
    async checkDatabaseHealth() {
        const startTime = Date.now();
        
        try {
            // Test basic connectivity
            const connection = await this.dbPool.getConnection();
            
            try {
                // Test simple query
                const [rows] = await connection.execute('SELECT 1 as test');
                
                if (!rows || rows[0].test !== 1) {
                    throw new Error('Database query test failed');
                }

                // Check critical tables exist
                const [tables] = await connection.execute(`
                    SELECT COUNT(*) as count 
                    FROM information_schema.tables 
                    WHERE table_schema = ? 
                    AND table_name IN ('Bouncer_Batches', 'Bouncer_Queue', 'Bouncer_Rate_Limit', 'Bouncer_Health_Metrics')
                `, [process.env.DB_NAME || 'omniverifier']);

                if (tables[0].count < 4) {
                    throw new Error('Required Bouncer tables missing');
                }

                // Get database status
                const [status] = await connection.execute('SHOW STATUS');
                const [variables] = await connection.execute('SHOW VARIABLES LIKE "max_connections"');

                const latency = Date.now() - startTime;

                return {
                    status: 'healthy',
                    latency,
                    connected: true,
                    max_connections: variables[0].Value,
                    active_connections: this.findStatusValue(status, 'Threads_connected'),
                    queries_per_second: this.findStatusValue(status, 'Queries'),
                    uptime: this.findStatusValue(status, 'Uptime')
                };

            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Database health check failed:', error);
            throw new Error(`Database health check failed: ${error.message}`);
        }
    }

    /**
     * Check Bouncer API health and availability
     * @returns {Object} Bouncer API health status
     */
    async checkBouncerApiHealth() {
        const startTime = Date.now();
        
        try {
            const apiKey = process.env.BOUNCER_API_KEY;
            const baseUrl = process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1';
            
            if (!apiKey) {
                throw new Error('Bouncer API key not configured');
            }

            // Test API connectivity with account info endpoint
            const response = await axios.get(`${baseUrl}/account`, {
                headers: {
                    'x-api-key': apiKey,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            const latency = Date.now() - startTime;

            if (response.status !== 200) {
                throw new Error(`API returned status ${response.status}`);
            }

            return {
                status: 'healthy',
                latency,
                api_version: '1.1',
                account_info: {
                    credits_remaining: response.data.credits || 0,
                    plan: response.data.plan || 'unknown'
                },
                rate_limit_remaining: response.headers['x-ratelimit-remaining'] || null,
                rate_limit_reset: response.headers['x-ratelimit-reset'] || null
            };

        } catch (error) {
            console.error('Bouncer API health check failed:', error);
            
            if (error.response) {
                throw new Error(`API error ${error.response.status}: ${error.response.data?.message || error.message}`);
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                throw new Error(`Network error: ${error.message}`);
            } else {
                throw new Error(`API health check failed: ${error.message}`);
            }
        }
    }

    /**
     * Get comprehensive queue statistics
     * @returns {Object} Queue statistics
     */
    async getQueueStats() {
        try {
            const stats = {};
            let totalJobs = 0;
            let totalFailed = 0;
            let totalActive = 0;
            let totalWaiting = 0;

            for (const [queueName, queue] of Object.entries(this.queues)) {
                try {
                    const [waiting, active, completed, failed, delayed] = await Promise.all([
                        queue.getWaiting(),
                        queue.getActive(),
                        queue.getCompleted(),
                        queue.getFailed(),
                        queue.getDelayed()
                    ]);

                    const queueStats = {
                        waiting: waiting.length,
                        active: active.length,
                        completed: completed.length,
                        failed: failed.length,
                        delayed: delayed.length,
                        total: waiting.length + active.length + completed.length + failed.length + delayed.length
                    };

                    stats[queueName] = queueStats;
                    totalJobs += queueStats.total;
                    totalFailed += queueStats.failed;
                    totalActive += queueStats.active;
                    totalWaiting += queueStats.waiting;

                } catch (queueError) {
                    console.error(`Error getting stats for queue ${queueName}:`, queueError);
                    stats[queueName] = {
                        status: 'error',
                        error: queueError.message
                    };
                }
            }

            return {
                status: 'healthy',
                queues: stats,
                totals: {
                    jobs: totalJobs,
                    failed: totalFailed,
                    active: totalActive,
                    waiting: totalWaiting,
                    error_rate: totalJobs > 0 ? (totalFailed / totalJobs * 100).toFixed(2) : 0
                }
            };

        } catch (error) {
            console.error('Queue stats check failed:', error);
            throw new Error(`Queue stats check failed: ${error.message}`);
        }
    }

    /**
     * Get current rate limit status
     * @returns {Object} Rate limit status
     */
    async getRateLimitStatus() {
        try {
            const connection = await this.dbPool.getConnection();
            
            try {
                const windowSizeMs = 60000; // 1 minute
                const now = new Date();
                const windowStart = new Date(now.getTime() - windowSizeMs);
                
                // Count requests in current window
                const [currentCount] = await connection.execute(`
                    SELECT COUNT(*) as count 
                    FROM Bouncer_Rate_Limit 
                    WHERE window_start_ts >= ?
                `, [windowStart]);

                const maxRequests = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 180;
                const currentRequests = currentCount[0].count;
                const utilizationPercent = (currentRequests / maxRequests * 100).toFixed(2);

                // Get rate limit history (last 5 minutes)
                const [history] = await connection.execute(`
                    SELECT 
                        COUNT(*) as requests,
                        DATE_FORMAT(window_start_ts, '%H:%i') as time_window
                    FROM Bouncer_Rate_Limit 
                    WHERE window_start_ts >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                    GROUP BY DATE_FORMAT(window_start_ts, '%H:%i')
                    ORDER BY window_start_ts DESC
                    LIMIT 5
                `);

                return {
                    status: utilizationPercent > 90 ? 'critical' : utilizationPercent > 70 ? 'warning' : 'healthy',
                    current_requests: currentRequests,
                    max_requests: maxRequests,
                    utilization_percent: parseFloat(utilizationPercent),
                    requests_remaining: maxRequests - currentRequests,
                    window_size_minutes: 1,
                    recent_history: history
                };

            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Rate limit status check failed:', error);
            throw new Error(`Rate limit status check failed: ${error.message}`);
        }
    }

    /**
     * Store health metrics in database
     * @param {Object} health - Health check results
     */
    async storeHealthMetrics(health) {
        try {
            const connection = await this.dbPool.getConnection();
            
            try {
                const metrics = [
                    ['system_status', health.status === 'healthy' ? 1 : 0],
                    ['response_time_ms', health.response_time || 0],
                    ['memory_usage_mb', Math.round(health.memory?.used / 1024 / 1024) || 0],
                    ['uptime_seconds', Math.round(health.uptime) || 0]
                ];

                // Add Redis metrics
                if (health.checks.redis?.status === 'healthy') {
                    metrics.push(['redis_latency_ms', health.checks.redis.latency]);
                    metrics.push(['redis_status', 1]);
                } else {
                    metrics.push(['redis_status', 0]);
                }

                // Add Database metrics
                if (health.checks.database?.status === 'healthy') {
                    metrics.push(['database_latency_ms', health.checks.database.latency]);
                    metrics.push(['database_status', 1]);
                    metrics.push(['database_connections', health.checks.database.active_connections || 0]);
                } else {
                    metrics.push(['database_status', 0]);
                }

                // Add Bouncer API metrics
                if (health.checks.bouncer_api?.status === 'healthy') {
                    metrics.push(['bouncer_api_latency_ms', health.checks.bouncer_api.latency]);
                    metrics.push(['bouncer_api_status', 1]);
                    metrics.push(['bouncer_credits_remaining', health.checks.bouncer_api.account_info?.credits_remaining || 0]);
                } else {
                    metrics.push(['bouncer_api_status', 0]);
                }

                // Add Queue metrics
                if (health.checks.queues?.status === 'healthy') {
                    metrics.push(['queue_total_jobs', health.checks.queues.totals.jobs]);
                    metrics.push(['queue_failed_jobs', health.checks.queues.totals.failed]);
                    metrics.push(['queue_active_jobs', health.checks.queues.totals.active]);
                    metrics.push(['queue_waiting_jobs', health.checks.queues.totals.waiting]);
                    metrics.push(['queue_error_rate', parseFloat(health.checks.queues.totals.error_rate)]);
                }

                // Add Rate limit metrics
                if (health.checks.rate_limit?.status) {
                    metrics.push(['rate_limit_utilization', health.checks.rate_limit.utilization_percent]);
                    metrics.push(['rate_limit_requests_remaining', health.checks.rate_limit.requests_remaining]);
                }

                // Insert all metrics
                const values = metrics.map(([name, value]) => [name, value]);
                
                await connection.execute(`
                    INSERT INTO Bouncer_Health_Metrics (metric_name, metric_value) 
                    VALUES ${values.map(() => '(?, ?)').join(', ')}
                `, values.flat());

                // Clean up old metrics (keep last 24 hours)
                await connection.execute(`
                    DELETE FROM Bouncer_Health_Metrics 
                    WHERE recorded_ts < DATE_SUB(NOW(), INTERVAL 24 HOUR)
                `);

            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Failed to store health metrics:', error);
            // Don't throw here as it would fail the entire health check
        }
    }

    /**
     * Parse Redis memory info
     * @param {string} memoryInfo - Redis memory info string
     * @returns {Object} Parsed memory information
     */
    parseRedisMemoryInfo(memoryInfo) {
        const lines = memoryInfo.split('\r\n');
        const memory = {};
        
        for (const line of lines) {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                if (key.includes('memory')) {
                    memory[key] = value;
                }
            }
        }
        
        return memory;
    }

    /**
     * Parse Redis server info
     * @param {string} serverInfo - Redis server info string
     * @returns {Object} Parsed server information
     */
    parseRedisServerInfo(serverInfo) {
        const lines = serverInfo.split('\r\n');
        const info = {};
        
        for (const line of lines) {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                if (['redis_version', 'uptime_in_seconds', 'connected_clients'].includes(key)) {
                    info[key] = value;
                }
            }
        }
        
        return info;
    }

    /**
     * Find value in MySQL status array
     * @param {Array} status - MySQL status array
     * @param {string} key - Status key to find
     * @returns {string} Status value
     */
    findStatusValue(status, key) {
        const item = status.find(s => s.Variable_name === key);
        return item ? item.Value : null;
    }

    /**
     * Get health check history
     * @param {number} hours - Hours of history to retrieve
     * @returns {Array} Health check history
     */
    async getHealthHistory(hours = 24) {
        try {
            const connection = await this.dbPool.getConnection();
            
            try {
                const [history] = await connection.execute(`
                    SELECT 
                        metric_name,
                        metric_value,
                        recorded_ts
                    FROM Bouncer_Health_Metrics 
                    WHERE recorded_ts >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                    ORDER BY recorded_ts DESC
                `, [hours]);

                return history;

            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Failed to get health history:', error);
            throw new Error(`Failed to get health history: ${error.message}`);
        }
    }

    /**
     * Close all connections
     */
    async close() {
        try {
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            
            if (this.dbPool) {
                await this.dbPool.end();
            }
            
            // Close queue connections
            for (const queue of Object.values(this.queues)) {
                await queue.close();
            }
            
        } catch (error) {
            console.error('Error closing health check service:', error);
        }
    }
}

module.exports = HealthCheckService;