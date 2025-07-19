/**
 * Enhanced Test Logger for Email Queue Test Suite
 * 
 * Provides comprehensive logging with different levels, timestamps, and request tracing
 * to help with debugging and monitoring test execution.
 */

const util = require('util');
const crypto = require('crypto');

class TestLogger {
    constructor(context = 'Test', options = {}) {
        this.context = context;
        this.startTime = Date.now();
        this.traceId = this.generateTraceId();
        this.options = {
            enableTrace: options.enableTrace !== false,
            enableDebug: options.enableDebug !== false,
            enableColors: options.enableColors !== false,
            logToFile: options.logToFile || null,
            ...options
        };
        
        // Log levels
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            SUCCESS: 3,
            TRACE: 4,
            DEBUG: 5
        };
        
        this.currentLevel = this.levels.DEBUG;
        
        // Colors for console output
        this.colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            gray: '\x1b[90m'
        };
        
        this.logEntries = [];
        this.initializeLogger();
    }
    
    initializeLogger() {
        this.info(`Logger initialized for ${this.context}`, { traceId: this.traceId });
    }
    
    generateTraceId() {
        return crypto.randomBytes(8).toString('hex');
    }
    
    getTimestamp() {
        const now = new Date();
        const elapsed = now.getTime() - this.startTime;
        return {
            absolute: now.toISOString(),
            relative: `+${elapsed}ms`,
            formatted: now.toLocaleTimeString()
        };
    }
    
    formatMessage(level, message, data = null) {
        const timestamp = this.getTimestamp();
        const entry = {
            timestamp: timestamp.absolute,
            elapsed: timestamp.relative,
            level,
            context: this.context,
            traceId: this.traceId,
            message,
            data
        };
        
        // Store entry for potential file logging
        this.logEntries.push(entry);
        
        // Format for console
        let formattedMessage = this.options.enableColors ? 
            this.formatWithColors(entry) : 
            this.formatPlain(entry);
            
        return { entry, formattedMessage };
    }
    
    formatWithColors(entry) {
        const levelColors = {
            ERROR: this.colors.red,
            WARN: this.colors.yellow,
            INFO: this.colors.blue,
            SUCCESS: this.colors.green,
            TRACE: this.colors.cyan,
            DEBUG: this.colors.gray
        };
        
        const levelColor = levelColors[entry.level] || this.colors.white;
        const timeColor = this.colors.dim;
        const contextColor = this.colors.magenta;
        
        let output = `${timeColor}[${entry.elapsed}]${this.colors.reset} `;
        output += `${levelColor}${entry.level.padEnd(7)}${this.colors.reset} `;
        output += `${contextColor}[${entry.context}]${this.colors.reset} `;
        output += `${entry.message}`;
        
        if (entry.data) {
            output += `\\n${this.colors.dim}${this.formatData(entry.data)}${this.colors.reset}`;
        }
        
        return output;
    }
    
    formatPlain(entry) {
        let output = `[${entry.elapsed}] ${entry.level.padEnd(7)} [${entry.context}] ${entry.message}`;
        
        if (entry.data) {
            output += `\\n${this.formatData(entry.data)}`;
        }
        
        return output;
    }
    
    formatData(data) {
        if (typeof data === 'string') {
            return `  ${data}`;
        }
        
        if (typeof data === 'object') {
            return util.inspect(data, { 
                depth: 3, 
                colors: this.options.enableColors,
                compact: false,
                breakLength: 80
            }).split('\\n').map(line => `  ${line}`).join('\\n');
        }
        
        return `  ${String(data)}`;
    }
    
    log(level, message, data = null) {
        if (this.levels[level] > this.currentLevel) {
            return;
        }
        
        const { entry, formattedMessage } = this.formatMessage(level, message, data);
        
        // Console output
        console.log(formattedMessage);
        
        // File output if enabled
        if (this.options.logToFile) {
            this.writeToFile(entry);
        }
        
        return entry;
    }
    
    // Convenience methods
    error(message, data = null) {
        return this.log('ERROR', message, data);
    }
    
    warn(message, data = null) {
        return this.log('WARN', message, data);
    }
    
    info(message, data = null) {
        return this.log('INFO', message, data);
    }
    
    success(message, data = null) {
        return this.log('SUCCESS', message, data);
    }
    
    trace(message, data = null) {
        if (!this.options.enableTrace) return;
        return this.log('TRACE', message, data);
    }
    
    debug(message, data = null) {
        if (!this.options.enableDebug) return;
        return this.log('DEBUG', message, data);
    }
    
    // Request tracing methods
    startRequest(requestName, requestData = null) {
        const requestId = this.generateTraceId();
        const startTime = Date.now();
        
        this.trace(`🚀 Starting request: ${requestName}`, {
            requestId,
            requestData,
            startTime: new Date(startTime).toISOString()
        });
        
        return {
            requestId,
            startTime,
            end: (result = null, error = null) => {
                const duration = Date.now() - startTime;
                const status = error ? 'FAILED' : 'SUCCESS';
                const symbol = error ? '❌' : '✅';
                
                this.trace(`${symbol} Request completed: ${requestName}`, {
                    requestId,
                    status,
                    duration: `${duration}ms`,
                    result: error ? null : result,
                    error: error ? error.message : null
                });
                
                return { requestId, status, duration, result, error };
            }
        };
    }
    
    // Performance tracking
    startTimer(name) {
        const startTime = Date.now();
        this.trace(`⏱️  Timer started: ${name}`);
        
        return {
            end: () => {
                const duration = Date.now() - startTime;
                this.trace(`⏱️  Timer ended: ${name} (${duration}ms)`);
                return duration;
            }
        };
    }
    
    // Batch operation logging
    logBatch(operation, items, batchSize = 10) {
        this.info(`📦 Batch operation: ${operation}`, {
            totalItems: items.length,
            batchSize,
            estimatedBatches: Math.ceil(items.length / batchSize)
        });
    }
    
    logBatchProgress(operation, currentBatch, totalBatches, processedItems) {
        const progress = ((currentBatch / totalBatches) * 100).toFixed(1);
        this.info(`📦 ${operation} progress: ${currentBatch}/${totalBatches} (${progress}%)`, {
            processedItems,
            remainingBatches: totalBatches - currentBatch
        });
    }
    
    // Database operation logging
    logDatabaseOperation(operation, table, data = null) {
        this.trace(`🗄️  Database ${operation}: ${table}`, data);
    }
    
    logDatabaseQuery(query, params = null, duration = null) {
        this.debug(`🗄️  SQL Query executed`, {
            query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
            params,
            duration: duration ? `${duration}ms` : null
        });
    }
    
    // API operation logging
    logApiCall(method, url, data = null) {
        this.trace(`🌐 API ${method}: ${url}`, data);
    }
    
    logApiResponse(method, url, status, duration, data = null) {
        const symbol = status >= 200 && status < 300 ? '✅' : '❌';
        this.trace(`🌐 ${symbol} API ${method}: ${url} (${status}) ${duration}ms`, data);
    }
    
    // Queue operation logging
    logQueueOperation(operation, queueName, jobData = null) {
        this.trace(`🔄 Queue ${operation}: ${queueName}`, jobData);
    }
    
    logQueueStatus(queueName, stats) {
        this.info(`🔄 Queue status: ${queueName}`, stats);
    }
    
    // Test-specific logging
    logTestStart(testName) {
        this.info(`🧪 Test started: ${testName}`);
    }
    
    logTestEnd(testName, passed, duration, details = null) {
        const symbol = passed ? '✅' : '❌';
        const status = passed ? 'PASSED' : 'FAILED';
        
        this.info(`🧪 ${symbol} Test ${status}: ${testName} (${duration}ms)`, details);
    }
    
    logAssertion(assertion, expected, actual, passed) {
        const symbol = passed ? '✅' : '❌';
        this.debug(`${symbol} Assertion: ${assertion}`, {
            expected,
            actual,
            passed
        });
    }
    
    // File logging
    writeToFile(entry) {
        if (!this.options.logToFile) return;
        
        const fs = require('fs');
        const logLine = JSON.stringify(entry) + '\\n';
        
        try {
            fs.appendFileSync(this.options.logToFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }
    
    // Export logs
    exportLogs(format = 'json') {
        switch (format) {
            case 'json':
                return JSON.stringify(this.logEntries, null, 2);
            case 'csv':
                return this.exportToCsv();
            case 'text':
                return this.exportToText();
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    
    exportToCsv() {
        const headers = ['timestamp', 'elapsed', 'level', 'context', 'traceId', 'message'];
        const rows = this.logEntries.map(entry => {
            return headers.map(header => {
                const value = entry[header] || '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',');
        });
        
        return [headers.join(','), ...rows].join('\\n');
    }
    
    exportToText() {
        return this.logEntries.map(entry => {
            return this.formatPlain(entry);
        }).join('\\n');
    }
    
    // Statistics
    getLogStats() {
        const stats = {
            total: this.logEntries.length,
            byLevel: {},
            timeRange: {
                start: this.logEntries[0]?.timestamp,
                end: this.logEntries[this.logEntries.length - 1]?.timestamp
            }
        };
        
        // Count by level
        this.logEntries.forEach(entry => {
            stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
        });
        
        return stats;
    }
    
    // Reset logger
    reset() {
        this.logEntries = [];
        this.startTime = Date.now();
        this.traceId = this.generateTraceId();
        this.info('Logger reset');
    }
    
    // Set log level
    setLevel(level) {
        if (typeof level === 'string' && this.levels[level.toUpperCase()] !== undefined) {
            this.currentLevel = this.levels[level.toUpperCase()];
            this.info(`Log level set to ${level.toUpperCase()}`);
        } else if (typeof level === 'number') {
            this.currentLevel = level;
            this.info(`Log level set to ${level}`);
        } else {
            throw new Error(`Invalid log level: ${level}`);
        }
    }
}

module.exports = TestLogger;