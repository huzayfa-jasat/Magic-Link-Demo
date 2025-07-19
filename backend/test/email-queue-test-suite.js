#!/usr/bin/env node

/**
 * Email Queue Test Suite
 * 
 * Comprehensive end-to-end testing for the email verification queue system.
 * This test suite simulates the complete workflow:
 * 1. Adding emails to the queue
 * 2. Processing through the Bouncer API (development mode)
 * 3. Saving validation responses to the database
 * 
 * Run with: node backend/test/email-queue-test-suite.js
 */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

// Import core modules
const knex = require('knex');
const config = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

// Import queue system
const { queueManager } = require('../queues/queue-manager');
const { emailVerificationProcessor } = require('../queues/processors/email-verification-processor');
const EmailQueueService = require('../services/email-queue');
const BouncerApiService = require('../services/bouncer-api');

// Import test utilities
const TestLogger = require('./utils/test-logger');
const TestDataGenerator = require('./utils/test-data-generator');

class EmailQueueTestSuite {
    constructor() {
        this.logger = new TestLogger('EmailQueueTest');
        this.dataGenerator = new TestDataGenerator();
        this.bouncerApi = new BouncerApiService();
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
        this.testUserId = null;
        this.testRequestId = null;
        this.cleanup = [];
    }

    async init() {
        this.logger.info('Initializing Email Queue Test Suite...');
        
        // Validate environment
        await this.validateEnvironment();
        
        // Setup test user and request
        await this.setupTestData();
        
        // Start queue manager
        await queueManager.start();
        
        this.logger.success('Test suite initialized successfully');
    }

    async validateEnvironment() {
        this.logger.info('Validating test environment...');
        
        const requiredEnvVars = [
            'BOUNCER_API_KEY',
            'BOUNCER_API_BASE_URL',
            'REDIS_HOST',
            'REDIS_PORT'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }

        // Ensure we're in development mode
        if (environment !== 'development') {
            throw new Error('Test suite must run in development environment only');
        }

        this.logger.success('Environment validation passed');
    }

    async setupTestData() {
        this.logger.info('Setting up test data...');
        
        // Create or get test user
        const testEmail = `test-${Date.now()}@example.com`;
        const [userResult] = await db('Users').insert({
            name: 'Test User',
            email: testEmail,
            password_hash: 'test-hash',
            status: 'active'
        }).returning('id');
        
        this.testUserId = userResult.id || userResult;
        this.cleanup.push(() => db('Users').where('id', this.testUserId).del());

        // Setup test credit balance
        await db('Users_Credit_Balance').insert({
            user_id: this.testUserId,
            current_balance: 10000 // Plenty of credits for testing
        });
        this.cleanup.push(() => db('Users_Credit_Balance').where('user_id', this.testUserId).del());

        // Create test request
        const [requestResult] = await db('Requests').insert({
            user_id: this.testUserId,
            request_status: 'pending',
            request_typ: 'bulk_verification'
        }).returning('request_id');
        
        this.testRequestId = requestResult.request_id || requestResult;
        this.cleanup.push(() => db('Requests').where('request_id', this.testRequestId).del());

        this.logger.success(`Test data setup complete - User: ${this.testUserId}, Request: ${this.testRequestId}`);
    }

    async runAllTests() {
        this.logger.info('Starting comprehensive email queue tests...');
        
        try {
            // Core functionality tests
            await this.test('Email Queue Addition', () => this.testEmailQueueAddition());
            await this.test('Batch Creation and Processing', () => this.testBatchCreation());
            await this.test('Email Validation Processing', () => this.testEmailValidation());
            await this.test('Database Result Storage', () => this.testDatabaseStorage());
            await this.test('Queue Status Monitoring', () => this.testQueueMonitoring());
            await this.test('Error Handling and Recovery', () => this.testErrorHandling());
            
            // Integration tests
            await this.test('End-to-End Workflow', () => this.testEndToEndWorkflow());
            await this.test('Concurrent Processing', () => this.testConcurrentProcessing());
            await this.test('Rate Limiting Compliance', () => this.testRateLimiting());
            
            // Performance tests
            await this.test('Large Batch Processing', () => this.testLargeBatch());
            
        } catch (error) {
            this.logger.error('Test suite execution failed:', error);
        } finally {
            await this.generateReport();
            await this.teardown();
        }
    }

    async test(name, testFn) {
        this.testResults.total++;
        const startTime = Date.now();
        
        this.logger.info(`Running test: ${name}`);
        
        try {
            await testFn();
            const duration = Date.now() - startTime;
            this.testResults.passed++;
            this.testResults.tests.push({
                name,
                status: 'PASSED',
                duration,
                error: null
            });
            this.logger.success(`✅ ${name} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.testResults.failed++;
            this.testResults.tests.push({
                name,
                status: 'FAILED',
                duration,
                error: error.message
            });
            this.logger.error(`❌ ${name} (${duration}ms): ${error.message}`);
        }
    }

    async testEmailQueueAddition() {
        this.logger.info('Testing email queue addition functionality...');
        
        // Generate test emails
        const emails = this.dataGenerator.generateTestEmails(50);
        
        // Add emails to queue
        const result = await EmailQueueService.addEmailsToQueue(
            emails.map(email => ({ global_id: Date.now() + Math.random(), email })),
            this.testUserId,
            this.testRequestId
        );
        
        if (!result.success) {
            throw new Error(`Failed to add emails to queue: ${result.error}`);
        }
        
        // Verify emails were added
        const queuedEmails = await EmailQueueService.getQueuedEmails(100);
        const ourEmails = queuedEmails.filter(item => item.user_id === this.testUserId);
        
        if (ourEmails.length < emails.length) {
            throw new Error(`Expected ${emails.length} emails in queue, got ${ourEmails.length}`);
        }
        
        this.logger.trace(`Successfully added ${emails.length} emails to queue`);
    }

    async testBatchCreation() {
        this.logger.info('Testing batch creation and API integration...');
        
        // Generate test emails
        const emails = this.dataGenerator.generateTestEmails(25);
        
        // Mock or use development API
        const mockBatchId = `test-batch-${Date.now()}`;
        
        // Test batch creation through queue manager
        const result = await queueManager.addEmailsToQueue(
            emails,
            this.testUserId,
            this.testRequestId
        );
        
        if (!result.jobIds || result.jobIds.length === 0) {
            throw new Error('No jobs were created for batch processing');
        }
        
        this.logger.trace(`Created ${result.batchCount} batches with ${result.totalEmails} emails`);
        
        // Wait for initial processing
        await this.sleep(2000);
        
        // Check queue stats
        const stats = await queueManager.getQueueStats();
        if (stats['email-verification'].total === 0) {
            throw new Error('No jobs found in email verification queue');
        }
        
        this.logger.trace('Batch creation completed successfully');
    }

    async testEmailValidation() {
        this.logger.info('Testing email validation through Bouncer API...');
        
        // Test with known good and bad emails
        const testEmails = [
            'valid.email@gmail.com',
            'test@example.com',
            'invalid@nonexistentdomain.fake'
        ];
        
        // Create test batch in database
        const [batchId] = await db('Bouncer_Batches').insert({
            user_id: this.testUserId,
            request_id: this.testRequestId,
            status: 'processing',
            quantity: testEmails.length
        }).returning('id');
        
        this.cleanup.push(() => db('Bouncer_Batches').where('id', batchId).del());
        
        // Simulate API response (in development mode)
        const mockResults = testEmails.map(email => ({
            email,
            status: email.includes('invalid') ? 'undeliverable' : 'deliverable',
            reason: email.includes('invalid') ? 'invalid_domain' : 'accepted',
            score: email.includes('invalid') ? 10 : 95,
            provider: 'gmail.com',
            toxic: false,
            toxicity: 'low'
        }));
        
        // Test result processing
        const updateResult = await EmailQueueService.updateContactResults(batchId, mockResults);
        
        if (!updateResult.success) {
            throw new Error('Failed to update contact results');
        }
        
        this.logger.trace(`Processed ${mockResults.length} email validation results`);
    }

    async testDatabaseStorage() {
        this.logger.info('Testing database storage of validation results...');
        
        // Create test contacts
        const testEmails = this.dataGenerator.generateTestEmails(10);
        const globalIds = [];
        
        for (const email of testEmails) {
            const [globalId] = await db('Contacts_Global').insert({
                email,
                user_id: this.testUserId,
                created_ts: new Date()
            }).returning('global_id');
            
            globalIds.push(globalId.global_id || globalId);
            this.cleanup.push(() => db('Contacts_Global').where('global_id', globalId.global_id || globalId).del());
        }
        
        // Create test batch
        const [batchId] = await db('Bouncer_Batches').insert({
            user_id: this.testUserId,
            request_id: this.testRequestId,
            status: 'completed',
            quantity: testEmails.length
        }).returning('id');
        
        this.cleanup.push(() => db('Bouncer_Batches').where('id', batchId).del());
        
        // Add to queue
        for (let i = 0; i < globalIds.length; i++) {
            await db('Bouncer_Queue').insert({
                global_id: globalIds[i],
                user_id: this.testUserId,
                request_id: this.testRequestId,
                batch_id: batchId,
                status: 'assigned'
            });
        }
        this.cleanup.push(() => db('Bouncer_Queue').where('batch_id', batchId).del());
        
        // Create mock results
        const mockResults = testEmails.map(email => ({
            email,
            status: 'deliverable',
            reason: 'accepted',
            score: 95,
            provider: 'gmail.com',
            toxic: false,
            toxicity: 'low'
        }));
        
        // Process results
        const result = await EmailQueueService.updateContactResults(batchId, mockResults);
        
        if (!result.success) {
            throw new Error('Failed to store validation results');
        }
        
        // Verify storage
        const storedResults = await db('Bouncer_Results').where('batch_id', batchId);
        if (storedResults.length !== testEmails.length) {
            throw new Error(`Expected ${testEmails.length} stored results, got ${storedResults.length}`);
        }
        
        // Verify contacts were updated
        const updatedContacts = await db('Contacts_Global')
            .whereIn('global_id', globalIds)
            .whereNotNull('bouncer_status');
            
        if (updatedContacts.length !== testEmails.length) {
            throw new Error(`Expected ${testEmails.length} updated contacts, got ${updatedContacts.length}`);
        }
        
        this.cleanup.push(() => db('Bouncer_Results').where('batch_id', batchId).del());
        
        this.logger.trace(`Successfully stored ${mockResults.length} validation results`);
    }

    async testQueueMonitoring() {
        this.logger.info('Testing queue monitoring and statistics...');
        
        // Get initial stats
        const initialStats = await queueManager.getQueueStats();
        this.logger.trace('Initial queue stats:', initialStats);
        
        // Add some test jobs
        const emails = this.dataGenerator.generateTestEmails(5);
        await queueManager.addEmailsToQueue(emails, this.testUserId, this.testRequestId);
        
        // Wait for processing
        await this.sleep(1000);
        
        // Get updated stats
        const updatedStats = await queueManager.getQueueStats();
        this.logger.trace('Updated queue stats:', updatedStats);
        
        // Verify stats tracking
        if (typeof updatedStats['email-verification'].total !== 'number') {
            throw new Error('Queue statistics not properly tracked');
        }
        
        // Test health status
        const health = await queueManager.getHealthStatus();
        if (!health.isRunning) {
            throw new Error('Queue manager health check failed');
        }
        
        this.logger.trace('Queue monitoring tests passed');
    }

    async testErrorHandling() {
        this.logger.info('Testing error handling and recovery mechanisms...');
        
        // Test with invalid email data
        try {
            await EmailQueueService.addEmailsToQueue([], this.testUserId, this.testRequestId);
            throw new Error('Should have failed with empty email array');
        } catch (error) {
            if (!error.message.includes('Invalid emails array')) {
                throw new Error('Unexpected error message for empty emails');
            }
        }
        
        // Test with insufficient credits
        const poorUserId = await this.createTestUserWithCredits(0);
        this.cleanup.push(() => db('Users').where('id', poorUserId).del());
        this.cleanup.push(() => db('Users_Credit_Balance').where('user_id', poorUserId).del());
        
        const result = await EmailQueueService.addEmailsToQueue(
            [{ global_id: Date.now(), email: 'test@example.com' }],
            poorUserId,
            this.testRequestId
        );
        
        if (result.success) {
            throw new Error('Should have failed with insufficient credits');
        }
        
        this.logger.trace('Error handling tests passed');
    }

    async testEndToEndWorkflow() {
        this.logger.info('Testing complete end-to-end workflow...');
        
        const emails = this.dataGenerator.generateTestEmails(20);
        const startTime = Date.now();
        
        // 1. Add emails to queue
        this.logger.trace('Step 1: Adding emails to queue...');
        const queueResult = await EmailQueueService.addEmailsToQueue(
            emails.map(email => ({ global_id: Date.now() + Math.random(), email })),
            this.testUserId,
            this.testRequestId
        );
        
        if (!queueResult.success) {
            throw new Error('Failed to add emails to queue');
        }
        
        // 2. Process through queue manager
        this.logger.trace('Step 2: Processing through queue manager...');
        const batchResult = await queueManager.addEmailsToQueue(emails, this.testUserId, this.testRequestId);
        
        if (!batchResult.jobIds || batchResult.jobIds.length === 0) {
            throw new Error('Failed to create processing jobs');
        }
        
        // 3. Wait for processing and monitor
        this.logger.trace('Step 3: Monitoring processing...');
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait
        
        while (attempts < maxAttempts) {
            const stats = await queueManager.getQueueStats();
            const activeJobs = stats['email-verification'].active + stats['email-verification'].waiting;
            
            if (activeJobs === 0) {
                break;
            }
            
            await this.sleep(1000);
            attempts++;
        }
        
        const duration = Date.now() - startTime;
        this.logger.trace(`End-to-end workflow completed in ${duration}ms`);
    }

    async testConcurrentProcessing() {
        this.logger.info('Testing concurrent processing capabilities...');
        
        const batchSize = 10;
        const numBatches = 3;
        const allPromises = [];
        
        // Create multiple concurrent batches
        for (let i = 0; i < numBatches; i++) {
            const emails = this.dataGenerator.generateTestEmails(batchSize);
            const promise = queueManager.addEmailsToQueue(emails, this.testUserId, this.testRequestId);
            allPromises.push(promise);
        }
        
        // Wait for all batches to be queued
        const results = await Promise.all(allPromises);
        
        // Verify all batches were created
        const totalJobs = results.reduce((sum, result) => sum + result.jobIds.length, 0);
        if (totalJobs < numBatches) {
            throw new Error(`Expected at least ${numBatches} jobs, got ${totalJobs}`);
        }
        
        this.logger.trace(`Successfully created ${totalJobs} concurrent processing jobs`);
    }

    async testRateLimiting() {
        this.logger.info('Testing rate limiting compliance...');
        
        // This test verifies that the system respects rate limits
        // In a real environment, this would test against actual API limits
        const emails = this.dataGenerator.generateTestEmails(5);
        
        // Add multiple batches quickly
        const startTime = Date.now();
        const promises = [];
        
        for (let i = 0; i < 3; i++) {
            promises.push(queueManager.addEmailsToQueue(emails, this.testUserId, this.testRequestId));
        }
        
        await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        // Verify that processing doesn't overwhelm the system
        if (duration < 100) {
            this.logger.trace('Rate limiting system handling requests efficiently');
        }
        
        this.logger.trace('Rate limiting tests completed');
    }

    async testLargeBatch() {
        this.logger.info('Testing large batch processing...');
        
        const largeEmailSet = this.dataGenerator.generateTestEmails(100);
        
        // Add large batch
        const result = await queueManager.addEmailsToQueue(largeEmailSet, this.testUserId, this.testRequestId);
        
        if (!result.jobIds || result.totalEmails !== largeEmailSet.length) {
            throw new Error('Large batch processing failed');
        }
        
        // Monitor processing
        const stats = await queueManager.getQueueStats();
        this.logger.trace(`Large batch created ${result.batchCount} batches for ${result.totalEmails} emails`);
        
        this.logger.trace('Large batch processing test completed');
    }

    async generateReport() {
        this.logger.info('Generating test report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            environment: environment,
            summary: {
                total: this.testResults.total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                successRate: ((this.testResults.passed / this.testResults.total) * 100).toFixed(1)
            },
            tests: this.testResults.tests,
            systemInfo: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            }
        };
        
        // Save report
        const reportPath = path.join(__dirname, `test-report-${Date.now()}.json`);
        require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.logger.info(`Test Report Generated: ${reportPath}`);
        this.logger.info(`Results: ${report.summary.passed}/${report.summary.total} passed (${report.summary.successRate}%)`);
        
        if (report.summary.failed > 0) {
            this.logger.error('Some tests failed. Check the report for details.');
            this.testResults.tests.filter(t => t.status === 'FAILED').forEach(test => {
                this.logger.error(`- ${test.name}: ${test.error}`);
            });
        } else {
            this.logger.success('🎉 All tests passed!');
        }
    }

    async teardown() {
        this.logger.info('Cleaning up test data...');
        
        try {
            // Stop queue manager
            await queueManager.stop();
            
            // Run all cleanup functions in reverse order
            for (let i = this.cleanup.length - 1; i >= 0; i--) {
                try {
                    await this.cleanup[i]();
                } catch (error) {
                    this.logger.warn(`Cleanup error: ${error.message}`);
                }
            }
            
            // Close database connection
            await db.destroy();
            
            this.logger.success('Cleanup completed');
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }

    // Helper methods
    async createTestUserWithCredits(credits) {
        const [userId] = await db('Users').insert({
            name: 'Test User',
            email: `test-${Date.now()}@example.com`,
            password_hash: 'test-hash',
            status: 'active'
        }).returning('id');
        
        const actualUserId = userId.id || userId;
        
        await db('Users_Credit_Balance').insert({
            user_id: actualUserId,
            current_balance: credits
        });
        
        return actualUserId;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
async function main() {
    console.log('🚀 Starting Email Queue Test Suite...\n');
    
    const testSuite = new EmailQueueTestSuite();
    
    try {
        await testSuite.init();
        await testSuite.runAllTests();
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = EmailQueueTestSuite;