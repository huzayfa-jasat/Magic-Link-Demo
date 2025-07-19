#!/usr/bin/env node

/**
 * Test Runner for Email Queue System
 * 
 * Executes the comprehensive test suite and handles environment setup/teardown.
 * Provides various test execution modes and reporting options.
 * 
 * Usage:
 *   node backend/test/run-tests.js [options]
 *   
 * Options:
 *   --suite=<name>     Run specific test suite (default: all)
 *   --verbose          Enable verbose logging
 *   --report=<format>  Generate report in specified format (json, html, text)
 *   --timeout=<ms>     Set test timeout (default: 300000ms)
 *   --env-check        Only run environment validation
 *   --cleanup-only     Only run cleanup operations
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    suite: 'all',
    verbose: false,
    report: 'json',
    timeout: 300000, // 5 minutes
    envCheck: false,
    cleanupOnly: false
};

// Parse arguments
args.forEach(arg => {
    if (arg.startsWith('--suite=')) {
        options.suite = arg.split('=')[1];
    } else if (arg === '--verbose') {
        options.verbose = true;
    } else if (arg.startsWith('--report=')) {
        options.report = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
        options.timeout = parseInt(arg.split('=')[1]);
    } else if (arg === '--env-check') {
        options.envCheck = true;
    } else if (arg === '--cleanup-only') {
        options.cleanupOnly = true;
    }
});

class TestRunner {
    constructor(options) {
        this.options = options;
        this.startTime = Date.now();
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            suites: []
        };
    }

    async run() {
        try {
            console.log('🚀 Email Queue Test Runner Starting...');
            console.log(`Options:`, this.options);
            console.log('');

            // Environment validation
            if (this.options.envCheck) {
                await this.validateEnvironment();
                return;
            }

            // Cleanup only
            if (this.options.cleanupOnly) {
                await this.cleanup();
                return;
            }

            // Full test execution
            await this.validateEnvironment();
            await this.setupTestEnvironment();
            await this.executeTests();
            await this.generateReports();

        } catch (error) {
            console.error('❌ Test runner failed:', error.message);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }

    async validateEnvironment() {
        console.log('🔍 Validating test environment...');

        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`  Node.js version: ${nodeVersion}`);

        // Check required environment variables
        const requiredEnvVars = [
            'NODE_ENV',
            'REDIS_HOST',
            'REDIS_PORT'
        ];

        const optionalEnvVars = [
            'BOUNCER_API_KEY',
            'BOUNCER_API_BASE_URL'
        ];

        let hasErrors = false;

        console.log('  Required environment variables:');
        requiredEnvVars.forEach(envVar => {
            if (process.env[envVar]) {
                console.log(`    ✅ ${envVar}: ${envVar.includes('PASSWORD') || envVar.includes('KEY') ? '[HIDDEN]' : process.env[envVar]}`);
            } else {
                console.log(`    ❌ ${envVar}: MISSING`);
                hasErrors = true;
            }
        });

        console.log('  Optional environment variables:');
        optionalEnvVars.forEach(envVar => {
            if (process.env[envVar]) {
                console.log(`    ✅ ${envVar}: ${envVar.includes('PASSWORD') || envVar.includes('KEY') ? '[HIDDEN]' : process.env[envVar]}`);
            } else {
                console.log(`    ⚠️  ${envVar}: NOT SET (will use mock)`);
            }
        });

        // Check environment
        if (process.env.NODE_ENV !== 'development') {
            console.log('    ❌ NODE_ENV must be "development" for tests');
            hasErrors = true;
        }

        // Check dependencies
        console.log('  Checking dependencies...');
        const packageJson = require('../package.json');
        const requiredDeps = ['bullmq', 'ioredis', 'knex', 'mysql2'];
        
        requiredDeps.forEach(dep => {
            if (packageJson.dependencies[dep]) {
                console.log(`    ✅ ${dep}: ${packageJson.dependencies[dep]}`);
            } else {
                console.log(`    ❌ ${dep}: MISSING`);
                hasErrors = true;
            }
        });

        // Check Redis connectivity
        console.log('  Testing Redis connection...');
        try {
            const Redis = require('ioredis');
            const redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 1
            });

            await redis.ping();
            console.log('    ✅ Redis connection successful');
            redis.disconnect();
        } catch (error) {
            console.log(`    ❌ Redis connection failed: ${error.message}`);
            hasErrors = true;
        }

        // Check database connectivity
        console.log('  Testing database connection...');
        try {
            const knex = require('knex');
            const config = require('../knexfile');
            const db = knex(config.development);
            
            await db.raw('SELECT 1');
            console.log('    ✅ Database connection successful');
            await db.destroy();
        } catch (error) {
            console.log(`    ❌ Database connection failed: ${error.message}`);
            hasErrors = true;
        }

        if (hasErrors) {
            throw new Error('Environment validation failed. Please fix the issues above.');
        }

        console.log('✅ Environment validation passed\n');
    }

    async setupTestEnvironment() {
        console.log('⚙️  Setting up test environment...');

        // Ensure test directories exist
        const testDirs = [
            path.join(__dirname, 'reports'),
            path.join(__dirname, 'temp')
        ];

        testDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`  Created directory: ${dir}`);
            }
        });

        // Set test-specific environment variables
        process.env.NODE_ENV = 'development';
        process.env.LOG_LEVEL = this.options.verbose ? 'debug' : 'info';

        console.log('✅ Test environment setup complete\n');
    }

    async executeTests() {
        console.log('🧪 Executing test suites...');

        const suites = this.getTestSuites();
        
        for (const suite of suites) {
            if (this.options.suite !== 'all' && suite.name !== this.options.suite) {
                console.log(`⏭️  Skipping suite: ${suite.name}`);
                continue;
            }

            console.log(`\n📦 Running suite: ${suite.name}`);
            const suiteResult = await this.executeSuite(suite);
            this.results.suites.push(suiteResult);
            
            this.results.total += suiteResult.total;
            this.results.passed += suiteResult.passed;
            this.results.failed += suiteResult.failed;
            this.results.skipped += suiteResult.skipped;
        }

        console.log('\n🧪 Test execution complete');
    }

    getTestSuites() {
        return [
            {
                name: 'email-queue',
                description: 'Email Queue System Tests',
                file: path.join(__dirname, 'email-queue-test-suite.js'),
                timeout: this.options.timeout
            }
            // Add more test suites here as needed
        ];
    }

    async executeSuite(suite) {
        const startTime = Date.now();
        
        try {
            console.log(`  📋 Suite: ${suite.description}`);
            console.log(`  📁 File: ${suite.file}`);
            
            // Check if test file exists
            if (!fs.existsSync(suite.file)) {
                throw new Error(`Test file not found: ${suite.file}`);
            }

            // Execute the test suite
            const result = await this.runNodeScript(suite.file, {
                timeout: suite.timeout,
                verbose: this.options.verbose
            });

            const duration = Date.now() - startTime;
            
            if (result.success) {
                console.log(`  ✅ Suite passed (${duration}ms)`);
                return {
                    name: suite.name,
                    status: 'passed',
                    duration,
                    total: result.total || 1,
                    passed: result.passed || 1,
                    failed: 0,
                    skipped: 0,
                    details: result.details
                };
            } else {
                console.log(`  ❌ Suite failed (${duration}ms): ${result.error}`);
                return {
                    name: suite.name,
                    status: 'failed',
                    duration,
                    total: result.total || 1,
                    passed: 0,
                    failed: result.failed || 1,
                    skipped: 0,
                    error: result.error,
                    details: result.details
                };
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`  ❌ Suite error (${duration}ms): ${error.message}`);
            
            return {
                name: suite.name,
                status: 'error',
                duration,
                total: 1,
                passed: 0,
                failed: 1,
                skipped: 0,
                error: error.message
            };
        }
    }

    async runNodeScript(scriptPath, options = {}) {
        return new Promise((resolve) => {
            const nodeArgs = [scriptPath];
            if (options.verbose) {
                nodeArgs.push('--verbose');
            }

            const child = spawn('node', nodeArgs, {
                stdio: 'pipe',
                cwd: path.dirname(scriptPath),
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
                if (options.verbose) {
                    process.stdout.write(data);
                }
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
                if (options.verbose) {
                    process.stderr.write(data);
                }
            });

            // Set timeout
            const timeout = setTimeout(() => {
                child.kill('SIGKILL');
                resolve({
                    success: false,
                    error: 'Test timeout exceeded',
                    stdout,
                    stderr
                });
            }, options.timeout || 300000);

            child.on('close', (code) => {
                clearTimeout(timeout);
                
                // Try to parse test results from stdout
                let testResults = null;
                try {
                    const lines = stdout.split('\n');
                    const resultLine = lines.find(line => line.includes('Test Results') || line.includes('results'));
                    if (resultLine) {
                        // Extract basic pass/fail info (this is simplified)
                        const passedMatch = resultLine.match(/(\d+)\/(\d+) passed/);
                        if (passedMatch) {
                            testResults = {
                                passed: parseInt(passedMatch[1]),
                                total: parseInt(passedMatch[2]),
                                failed: parseInt(passedMatch[2]) - parseInt(passedMatch[1])
                            };
                        }
                    }
                } catch (error) {
                    // Ignore parsing errors
                }

                resolve({
                    success: code === 0,
                    error: code !== 0 ? `Process exited with code ${code}` : null,
                    stdout,
                    stderr,
                    ...testResults,
                    details: { code, stdout: stdout.substring(0, 1000) } // First 1000 chars
                });
            });

            child.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    error: error.message,
                    stdout,
                    stderr
                });
            });
        });
    }

    async generateReports() {
        console.log('\n📊 Generating test reports...');

        const duration = Date.now() - this.startTime;
        const report = {
            timestamp: new Date().toISOString(),
            duration,
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            summary: {
                total: this.results.total,
                passed: this.results.passed,
                failed: this.results.failed,
                skipped: this.results.skipped,
                successRate: this.results.total > 0 ? ((this.results.passed / this.results.total) * 100).toFixed(1) : 0
            },
            suites: this.results.suites
        };

        // Generate reports in requested format
        const reportDir = path.join(__dirname, 'reports');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        switch (this.options.report) {
            case 'json':
                const jsonPath = path.join(reportDir, `test-report-${timestamp}.json`);
                fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
                console.log(`  📄 JSON report: ${jsonPath}`);
                break;

            case 'text':
                const textPath = path.join(reportDir, `test-report-${timestamp}.txt`);
                const textReport = this.generateTextReport(report);
                fs.writeFileSync(textPath, textReport);
                console.log(`  📄 Text report: ${textPath}`);
                break;

            case 'html':
                const htmlPath = path.join(reportDir, `test-report-${timestamp}.html`);
                const htmlReport = this.generateHtmlReport(report);
                fs.writeFileSync(htmlPath, htmlReport);
                console.log(`  📄 HTML report: ${htmlPath}`);
                break;
        }

        // Console summary
        console.log('\n📋 Test Summary:');
        console.log(`  Total Tests: ${report.summary.total}`);
        console.log(`  Passed: ${report.summary.passed} ✅`);
        console.log(`  Failed: ${report.summary.failed} ❌`);
        console.log(`  Skipped: ${report.summary.skipped} ⏭️`);
        console.log(`  Success Rate: ${report.summary.successRate}%`);
        console.log(`  Duration: ${duration}ms`);

        if (report.summary.failed > 0) {
            console.log('\n❌ Failed Suites:');
            report.suites.filter(s => s.status === 'failed' || s.status === 'error').forEach(suite => {
                console.log(`  - ${suite.name}: ${suite.error || 'Unknown error'}`);
            });
        } else {
            console.log('\n🎉 All tests passed!');
        }
    }

    generateTextReport(report) {
        let text = `Email Queue Test Report\n`;
        text += `========================\n\n`;
        text += `Generated: ${report.timestamp}\n`;
        text += `Duration: ${report.duration}ms\n`;
        text += `Environment: ${report.environment.nodeVersion} on ${report.environment.platform}\n\n`;
        
        text += `Summary:\n`;
        text += `  Total: ${report.summary.total}\n`;
        text += `  Passed: ${report.summary.passed}\n`;
        text += `  Failed: ${report.summary.failed}\n`;
        text += `  Success Rate: ${report.summary.successRate}%\n\n`;
        
        text += `Test Suites:\n`;
        report.suites.forEach(suite => {
            text += `  ${suite.name}: ${suite.status.toUpperCase()} (${suite.duration}ms)\n`;
            if (suite.error) {
                text += `    Error: ${suite.error}\n`;
            }
        });
        
        return text;
    }

    generateHtmlReport(report) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Email Queue Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .suite { margin: 10px 0; padding: 10px; border-left: 4px solid #ddd; }
        .passed { border-left-color: #4CAF50; }
        .failed { border-left-color: #f44336; }
        .error { border-left-color: #ff9800; }
        .stats { display: flex; gap: 20px; }
        .stat { text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Email Queue Test Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Duration: ${report.duration}ms</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="stats">
            <div class="stat">
                <h3>${report.summary.total}</h3>
                <p>Total Tests</p>
            </div>
            <div class="stat">
                <h3>${report.summary.passed}</h3>
                <p>Passed</p>
            </div>
            <div class="stat">
                <h3>${report.summary.failed}</h3>
                <p>Failed</p>
            </div>
            <div class="stat">
                <h3>${report.summary.successRate}%</h3>
                <p>Success Rate</p>
            </div>
        </div>
    </div>
    
    <div class="suites">
        <h2>Test Suites</h2>
        ${report.suites.map(suite => `
            <div class="suite ${suite.status}">
                <h3>${suite.name}</h3>
                <p>Status: ${suite.status.toUpperCase()}</p>
                <p>Duration: ${suite.duration}ms</p>
                ${suite.error ? `<p>Error: ${suite.error}</p>` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>`;
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        // Clean up temp files
        const tempDir = path.join(__dirname, 'temp');
        if (fs.existsSync(tempDir)) {
            const tempFiles = fs.readdirSync(tempDir);
            tempFiles.forEach(file => {
                fs.unlinkSync(path.join(tempDir, file));
            });
            console.log('  Cleaned temp files');
        }

        console.log('✅ Cleanup complete');
    }
}

// Main execution
async function main() {
    const runner = new TestRunner(options);
    await runner.run();
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;