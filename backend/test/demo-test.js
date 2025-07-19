#!/usr/bin/env node

/**
 * Demo Test for Email Queue System
 * 
 * This demonstrates the test suite capabilities without requiring 
 * full environment setup (Redis, Database, API keys).
 * 
 * Shows:
 * - Test data generation
 * - Logging functionality
 * - Queue simulation
 * - Test structure validation
 */

const path = require('path');
const TestLogger = require('./utils/test-logger');
const TestDataGenerator = require('./utils/test-data-generator');

class DemoTest {
    constructor() {
        this.logger = new TestLogger('DemoTest', { enableColors: true });
        this.dataGenerator = new TestDataGenerator();
        this.results = {
            total: 0,
            passed: 0,
            failed: 0
        };
    }

    async runDemo() {
        this.logger.info('🚀 Starting Email Queue System Demo Test');
        
        try {
            await this.test('Test Infrastructure Validation', () => this.testInfrastructure());
            await this.test('Data Generation', () => this.testDataGeneration());
            await this.test('Logging System', () => this.testLogging());
            await this.test('Queue Simulation', () => this.testQueueSimulation());
            await this.test('Mock API Processing', () => this.testMockApiProcessing());
            await this.test('End-to-End Workflow Simulation', () => this.testEndToEndWorkflow());
            
            this.generateSummary();
            
        } catch (error) {
            this.logger.error('Demo test failed:', error);
            process.exit(1);
        }
    }

    async test(name, testFn) {
        this.results.total++;
        const startTime = Date.now();
        
        this.logger.info(`\n🧪 Running: ${name}`);
        
        try {
            await testFn();
            const duration = Date.now() - startTime;
            this.results.passed++;
            this.logger.success(`✅ ${name} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.results.failed++;
            this.logger.error(`❌ ${name} (${duration}ms): ${error.message}`);
        }
    }

    async testInfrastructure() {
        this.logger.trace('Validating test infrastructure components...');
        
        // Check that all test files exist
        const requiredFiles = [
            'utils/test-logger.js',
            'utils/test-data-generator.js',
            'test-routes.js',
            'email-queue-test-suite.js',
            'run-tests.js'
        ];
        
        const fs = require('fs');
        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Required test file missing: ${file}`);
            }
        }
        
        // Check main app.js has test routes
        const appPath = path.join(__dirname, '../app.js');
        const appContent = fs.readFileSync(appPath, 'utf8');
        if (!appContent.includes('test/test-routes.js')) {
            throw new Error('Test routes not integrated into main app.js');
        }
        
        this.logger.trace('All infrastructure components validated');
    }

    async testDataGeneration() {
        this.logger.trace('Testing data generation capabilities...');
        
        // Test email generation
        const emails = this.dataGenerator.generateTestEmails(10, {
            validRatio: 0.8,
            includeEdgeCases: true
        });
        
        if (emails.length !== 10) {
            throw new Error(`Expected 10 emails, got ${emails.length}`);
        }
        
        // Test bulk data generation
        const bulkData = this.dataGenerator.generateBulkEmailData(100, {
            batchSize: 25
        });
        
        if (bulkData.batchCount !== 4) {
            throw new Error(`Expected 4 batches, got ${bulkData.batchCount}`);
        }
        
        // Test catchall emails
        const catchallEmails = this.dataGenerator.generateCatchAllEmails(5);
        if (catchallEmails.length !== 5) {
            throw new Error(`Expected 5 catchall emails, got ${catchallEmails.length}`);
        }
        
        // Test mock API responses
        const mockResponses = this.dataGenerator.generateMockBouncerResponse(emails.slice(0, 3));
        if (mockResponses.length !== 3) {
            throw new Error(`Expected 3 mock responses, got ${mockResponses.length}`);
        }
        
        this.logger.trace('Data generation test completed', {
            emailsGenerated: emails.length,
            batchesGenerated: bulkData.batchCount,
            catchallEmails: catchallEmails.length,
            mockResponses: mockResponses.length
        });
    }

    async testLogging() {
        this.logger.trace('Testing logging system capabilities...');
        
        // Test different log levels
        this.logger.debug('Debug message test');
        this.logger.info('Info message test');
        this.logger.warn('Warning message test');
        this.logger.success('Success message test');
        
        // Test request tracing
        const request = this.logger.startRequest('test-request', { data: 'test' });
        await this.sleep(10);
        request.end({ result: 'success' });
        
        // Test batch logging
        this.logger.logBatch('test-operation', [1, 2, 3, 4, 5]);
        
        // Test timer
        const timer = this.logger.startTimer('test-timer');
        await this.sleep(5);
        timer.end();
        
        // Test stats
        const stats = this.logger.getLogStats();
        if (stats.total === 0) {
            throw new Error('Log stats not tracking entries');
        }
        
        this.logger.trace('Logging system test completed', { logEntries: stats.total });
    }

    async testQueueSimulation() {
        this.logger.trace('Testing queue simulation...');
        
        // Simulate queue operations without actual queue
        const emails = this.dataGenerator.generateTestEmails(20);
        
        this.logger.logQueueOperation('add', 'email-verification', {
            emailCount: emails.length,
            userId: 'test-user',
            requestId: 'test-request'
        });
        
        // Simulate batch processing
        const batchSize = 10;
        const batches = [];
        for (let i = 0; i < emails.length; i += batchSize) {
            batches.push(emails.slice(i, i + batchSize));
        }
        
        for (let i = 0; i < batches.length; i++) {
            this.logger.logBatchProgress('processing', i + 1, batches.length, i * batchSize);
            await this.sleep(10); // Simulate processing time
        }
        
        // Simulate queue status
        this.logger.logQueueStatus('email-verification', {
            waiting: 0,
            active: 0,
            completed: emails.length,
            failed: 0
        });
        
        this.logger.trace('Queue simulation completed', {
            totalEmails: emails.length,
            batchCount: batches.length
        });
    }

    async testMockApiProcessing() {
        this.logger.trace('Testing mock API processing...');
        
        const emails = this.dataGenerator.generateTestEmails(5);
        
        // Simulate API calls
        for (const email of emails) {
            const apiCall = this.logger.startRequest('bouncer-api-call', {
                email,
                endpoint: '/batch'
            });
            
            // Simulate API processing time
            await this.sleep(50);
            
            // Generate mock response
            const mockResponse = this.dataGenerator.generateMockBouncerResponse([email])[0];
            
            apiCall.end(mockResponse);
            
            this.logger.logApiResponse('POST', '/batch', 200, 50, {
                email: mockResponse.email,
                status: mockResponse.status
            });
        }
        
        this.logger.trace('Mock API processing completed', { processedEmails: emails.length });
    }

    async testEndToEndWorkflow() {
        this.logger.trace('Testing end-to-end workflow simulation...');
        
        const workflowTimer = this.logger.startTimer('end-to-end-workflow');
        
        // 1. Generate test data
        this.logger.info('Step 1: Generating test emails...');
        const emails = this.dataGenerator.generateTestEmails(15, {
            validRatio: 0.9,
            includeEdgeCases: true
        });
        
        // 2. Simulate queue addition
        this.logger.info('Step 2: Adding emails to queue...');
        this.logger.logQueueOperation('add', 'email-verification', {
            emailCount: emails.length,
            userId: 'workflow-test-user',
            requestId: 'workflow-test-request'
        });
        
        // 3. Simulate batch creation
        this.logger.info('Step 3: Creating batches...');
        const batchSize = 5;
        const batches = [];
        for (let i = 0; i < emails.length; i += batchSize) {
            batches.push(emails.slice(i, i + batchSize));
        }
        
        // 4. Simulate API processing
        this.logger.info('Step 4: Processing through API...');
        const allResults = [];
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            
            this.logger.logBatchProgress('api-processing', batchIndex + 1, batches.length, batchIndex * batchSize);
            
            // Simulate API call
            await this.sleep(100);
            
            // Generate mock results
            const batchResults = this.dataGenerator.generateMockBouncerResponse(batch);
            allResults.push(...batchResults);
            
            this.logger.logApiCall('POST', `/batch/${batchIndex + 1}`, {
                batchSize: batch.length,
                batchId: `batch-${batchIndex + 1}`
            });
        }
        
        // 5. Simulate database storage
        this.logger.info('Step 5: Storing results to database...');
        for (const result of allResults) {
            this.logger.logDatabaseOperation('insert', 'Bouncer_Results', {
                email: result.email,
                status: result.status,
                score: result.score
            });
        }
        
        // 6. Generate workflow summary
        const workflowDuration = workflowTimer.end();
        
        const summary = {
            totalEmails: emails.length,
            batchCount: batches.length,
            processedResults: allResults.length,
            successfulResults: allResults.filter(r => r.status === 'deliverable').length,
            failedResults: allResults.filter(r => r.status === 'undeliverable').length,
            duration: workflowDuration
        };
        
        this.logger.success('End-to-end workflow completed', summary);
        
        if (summary.processedResults !== summary.totalEmails) {
            throw new Error(`Processed ${summary.processedResults} results but expected ${summary.totalEmails}`);
        }
    }

    generateSummary() {
        this.logger.info('\n📊 Demo Test Summary');
        this.logger.info('=====================');
        
        const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
        
        this.logger.info(`Total Tests: ${this.results.total}`);
        this.logger.info(`Passed: ${this.results.passed} ✅`);
        this.logger.info(`Failed: ${this.results.failed} ❌`);
        this.logger.info(`Success Rate: ${successRate}%`);
        
        if (this.results.failed === 0) {
            this.logger.success('\n🎉 All demo tests passed!');
            this.logger.info('\n📋 What has been built:');
            this.logger.info('• Complete test suite infrastructure');
            this.logger.info('• Email queue simulation system');
            this.logger.info('• Comprehensive logging with request tracing');
            this.logger.info('• Test data generation utilities');
            this.logger.info('• HTTP test routes for API testing');
            this.logger.info('• Mock Bouncer API integration');
            this.logger.info('• End-to-end workflow testing');
            this.logger.info('• Automated test runner with reporting');
            this.logger.info('\n🚀 Ready for production email validation testing!');
        } else {
            this.logger.error(`\n❌ ${this.results.failed} test(s) failed`);
        }
        
        // Show log statistics
        const logStats = this.logger.getLogStats();
        this.logger.info(`\n📈 Log Statistics: ${logStats.total} entries`);
        Object.entries(logStats.byLevel).forEach(([level, count]) => {
            this.logger.info(`  ${level}: ${count}`);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
async function main() {
    const demo = new DemoTest();
    await demo.runDemo();
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Demo test failed:', error);
        process.exit(1);
    });
}

module.exports = DemoTest;