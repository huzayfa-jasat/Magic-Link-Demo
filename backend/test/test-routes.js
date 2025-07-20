/**
 * Test Routes for Email Queue System
 * 
 * Provides HTTP endpoints for testing the email queue system:
 * - Simulating email imports
 * - Monitoring queue status
 * - Triggering test scenarios
 * - Viewing test results
 * 
 * These routes are for development/testing purposes only
 */

const express = require('express');
const router = express.Router();

// Import core modules
const { queueManager } = require('../queues/queue-manager');
const EmailQueueService = require('../services/email-queue');
const TestLogger = require('./utils/test-logger');
const TestDataGenerator = require('./utils/test-data-generator');

// Initialize utilities
const logger = new TestLogger('TestRoutes');
const dataGenerator = new TestDataGenerator();

// Middleware for test environment only
router.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({
            error: 'Test routes are only available in development environment'
        });
    }
    next();
});

// Middleware for request logging
router.use((req, res, next) => {
    const requestTrace = logger.startRequest(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body,
        query: req.query
    });
    
    req.requestTrace = requestTrace;
    
    // Log response on finish
    res.on('finish', () => {
        requestTrace.end({
            statusCode: res.statusCode,
            responseTime: Date.now() - requestTrace.startTime
        });
    });
    
    next();
});

/**
 * POST /test/queue/simulate-import
 * Simulate importing emails into the queue
 */
router.post('/queue/simulate-import', async (req, res) => {
    try {
        const {
            emailCount = 10,
            validRatio = 0.8,
            includeEdgeCases = true,
            userId = 'test-user',
            requestId = `test-${Date.now()}`
        } = req.body;
        
        logger.info(`Simulating email import`, {
            emailCount,
            validRatio,
            includeEdgeCases,
            userId,
            requestId
        });
        
        // Generate test emails
        const emails = dataGenerator.generateTestEmails(emailCount, {
            validRatio,
            includeEdgeCases
        });
        
        // Add to queue
        const result = await queueManager.addEmailsToQueue(emails, userId, requestId);
        
        logger.success(`Email import simulation completed`, {
            totalEmails: result.totalEmails,
            batchCount: result.batchCount,
            jobIds: result.jobIds
        });
        
        res.json({
            success: true,
            data: {
                emailCount: result.totalEmails,
                batchCount: result.batchCount,
                jobIds: result.jobIds,
                emails: emails.slice(0, 5), // Return first 5 emails for verification
                requestId,
                userId
            }
        });
        
    } catch (error) {
        logger.error('Email import simulation failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/queue/simulate-bulk-import
 * Simulate bulk import with multiple concurrent requests
 */
router.post('/queue/simulate-bulk-import', async (req, res) => {
    try {
        const {
            concurrentUsers = 3,
            emailsPerUser = 50,
            staggerDelay = 1000
        } = req.body;
        
        logger.info(`Simulating bulk import`, {
            concurrentUsers,
            emailsPerUser,
            staggerDelay
        });
        
        const promises = [];
        const results = [];
        
        for (let i = 0; i < concurrentUsers; i++) {
            const promise = new Promise(async (resolve) => {
                // Stagger the requests
                await new Promise(r => setTimeout(r, i * staggerDelay));
                
                const emails = dataGenerator.generateTestEmails(emailsPerUser);
                const userId = `bulk-test-user-${i + 1}`;
                const requestId = `bulk-test-${Date.now()}-${i + 1}`;
                
                try {
                    const result = await queueManager.addEmailsToQueue(emails, userId, requestId);
                    resolve({
                        userId,
                        requestId,
                        success: true,
                        ...result
                    });
                } catch (error) {
                    resolve({
                        userId,
                        requestId,
                        success: false,
                        error: error.message
                    });
                }
            });
            
            promises.push(promise);
        }
        
        const allResults = await Promise.all(promises);
        
        const summary = {
            totalUsers: concurrentUsers,
            successfulUsers: allResults.filter(r => r.success).length,
            failedUsers: allResults.filter(r => !r.success).length,
            totalEmails: allResults.reduce((sum, r) => sum + (r.totalEmails || 0), 0),
            totalBatches: allResults.reduce((sum, r) => sum + (r.batchCount || 0), 0)
        };
        
        logger.success(`Bulk import simulation completed`, summary);
        
        res.json({
            success: true,
            data: {
                summary,
                results: allResults
            }
        });
        
    } catch (error) {
        logger.error('Bulk import simulation failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/queue/simulate-catchall
 * Simulate catchall email processing
 */
router.post('/queue/simulate-catchall', async (req, res) => {
    try {
        const {
            emailCount = 10,
            userId = 'catchall-test-user',
            requestId = `catchall-test-${Date.now()}`
        } = req.body;
        
        logger.info(`Simulating catchall processing`, {
            emailCount,
            userId,
            requestId
        });
        
        // Generate catchall test emails
        const emails = dataGenerator.generateCatchAllEmails(emailCount);
        
        // Add to queue (would use catchall queue in real implementation)
        const result = await queueManager.addEmailsToQueue(emails, userId, requestId);
        
        logger.success(`Catchall simulation completed`, {
            totalEmails: result.totalEmails,
            batchCount: result.batchCount
        });
        
        res.json({
            success: true,
            data: {
                emailCount: result.totalEmails,
                batchCount: result.batchCount,
                emails: emails,
                requestId,
                userId,
                type: 'catchall'
            }
        });
        
    } catch (error) {
        logger.error('Catchall simulation failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /test/queue/status
 * Get current queue status and statistics
 */
router.get('/queue/status', async (req, res) => {
    try {
        logger.trace('Fetching queue status');
        
        const stats = await queueManager.getQueueStats();
        const health = await queueManager.getHealthStatus();
        
        res.json({
            success: true,
            data: {
                stats,
                health,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        logger.error('Failed to fetch queue status', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/queue/control
 * Control queue operations (pause, resume, retry, clean)
 */
router.post('/queue/control', async (req, res) => {
    try {
        const { action, queueName, options = {} } = req.body;
        
        logger.info(`Queue control action`, { action, queueName, options });
        
        let result;
        
        switch (action) {
            case 'start':
                if (!queueManager.isRunning) {
                    await queueManager.start();
                    result = { message: 'Queue manager started successfully' };
                } else {
                    result = { message: 'Queue manager is already running' };
                }
                break;
                
            case 'stop':
                if (queueManager.isRunning) {
                    await queueManager.stop();
                    result = { message: 'Queue manager stopped successfully' };
                } else {
                    result = { message: 'Queue manager is not running' };
                }
                break;
                
            case 'pause':
                await queueManager.pauseQueue(queueName);
                result = { message: `Queue ${queueName} paused` };
                break;
                
            case 'resume':
                await queueManager.resumeQueue(queueName);
                result = { message: `Queue ${queueName} resumed` };
                break;
                
            case 'retry':
                const retriedCount = await queueManager.retryFailedJobs(queueName);
                result = { message: `Retried ${retriedCount} failed jobs in ${queueName}` };
                break;
                
            case 'clean':
                const cleanedCount = await queueManager.cleanFailedJobs(queueName, options.olderThanHours || 24);
                result = { message: `Cleaned ${cleanedCount} failed jobs from ${queueName}` };
                break;
                
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        
        logger.success('Queue control action completed', result);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        logger.error('Queue control action failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/queue/performance-test
 * Run performance tests with various scenarios
 */
router.post('/queue/performance-test', async (req, res) => {
    try {
        const { scenario = 'medium' } = req.body;
        
        logger.info(`Starting performance test`, { scenario });
        
        const scenarios = dataGenerator.generatePerformanceTestScenarios();
        const testScenario = scenarios.find(s => s.name.toLowerCase().includes(scenario.toLowerCase()));
        
        if (!testScenario) {
            throw new Error(`Unknown scenario: ${scenario}`);
        }
        
        const startTime = Date.now();
        
        // Generate test emails
        const emails = dataGenerator.generateTestEmails(testScenario.emailCount, {
            validRatio: 0.9,
            includeEdgeCases: true
        });
        
        // Add to queue
        const result = await queueManager.addEmailsToQueue(emails, 'perf-test-user', `perf-test-${Date.now()}`);
        
        const queueTime = Date.now() - startTime;
        
        logger.success(`Performance test queued`, {
            scenario: testScenario.name,
            emailCount: testScenario.emailCount,
            queueTime,
            batchCount: result.batchCount
        });
        
        res.json({
            success: true,
            data: {
                scenario: testScenario,
                result,
                timing: {
                    queueTime,
                    expectedProcessingTime: testScenario.expectedProcessingTime
                }
            }
        });
        
    } catch (error) {
        logger.error('Performance test failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/data/generate
 * Generate various types of test data
 */
router.post('/data/generate', async (req, res) => {
    try {
        const {
            type = 'emails',
            count = 10,
            options = {}
        } = req.body;
        
        logger.trace(`Generating test data`, { type, count, options });
        
        let data;
        
        switch (type) {
            case 'emails':
                data = dataGenerator.generateTestEmails(count, options);
                break;
                
            case 'bulk':
                data = dataGenerator.generateBulkEmailData(count, options);
                break;
                
            case 'edge-cases':
                data = dataGenerator.generateEdgeCaseEmails();
                break;
                
            case 'catchall':
                data = dataGenerator.generateCatchAllEmails(count);
                break;
                
            case 'csv':
                data = dataGenerator.generateCsvTestData(count);
                break;
                
            case 'stress':
                data = dataGenerator.generateStressTestData(options.concurrentUsers, options.emailsPerUser);
                break;
                
            default:
                throw new Error(`Unknown data type: ${type}`);
        }
        
        res.json({
            success: true,
            data: {
                type,
                count: Array.isArray(data) ? data.length : (data.count || count),
                data
            }
        });
        
    } catch (error) {
        logger.error('Test data generation failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /test/logs
 * Get test logs and statistics
 */
router.get('/logs', async (req, res) => {
    try {
        const { format = 'json', limit = 100 } = req.query;
        
        const stats = logger.getLogStats();
        const logs = logger.logEntries.slice(-limit);
        
        let response;
        
        switch (format) {
            case 'json':
                response = {
                    success: true,
                    data: {
                        stats,
                        logs
                    }
                };
                break;
                
            case 'csv':
                res.set('Content-Type', 'text/csv');
                res.set('Content-Disposition', 'attachment; filename="test-logs.csv"');
                return res.send(logger.exportLogs('csv'));
                
            case 'text':
                res.set('Content-Type', 'text/plain');
                return res.send(logger.exportLogs('text'));
                
            default:
                throw new Error(`Unknown format: ${format}`);
        }
        
        res.json(response);
        
    } catch (error) {
        logger.error('Failed to retrieve logs', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /test/reset
 * Reset test environment (clear logs, reset counters)
 */
router.post('/reset', async (req, res) => {
    try {
        logger.info('Resetting test environment');
        
        // Reset logger
        logger.reset();
        
        // Could also reset queue states, clear test data, etc.
        // For safety, we'll keep this minimal in the current implementation
        
        logger.success('Test environment reset completed');
        
        res.json({
            success: true,
            data: {
                message: 'Test environment reset completed',
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        logger.error('Test environment reset failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /test/health
 * Health check for test system
 */
router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            services: {
                queueManager: queueManager.isRunning,
                logger: true,
                dataGenerator: true
            },
            stats: logger.getLogStats()
        };
        
        res.json({
            success: true,
            data: health
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;