#!/usr/bin/env node

/**
 * Bouncer Email Verification Queue Workers
 * 
 * This script starts all the queue workers for email verification processing.
 * It handles the email verification queue with proper rate limiting and error handling.
 * 
 * Usage:
 *   node start-workers.js
 * 
 * Environment Variables:
 *   REDIS_HOST - Redis server host (default: localhost)
 *   REDIS_PORT - Redis server port (default: 6379)
 *   REDIS_PASSWORD - Redis password (if required)
 *   BOUNCER_API_KEY - Bouncer API key (required)
 *   BOUNCER_API_BASE_URL - Bouncer API base URL (default: https://api.usebouncer.com/v1.1)
 *   MAX_CONCURRENT_BATCHES - Maximum concurrent batches (default: 15)
 *   BATCH_SIZE - Batch size for email processing (default: 10000)
 *   NODE_ENV - Environment (development/production)
 */

require('dotenv').config();
const { queueManager } = require('./queue-manager');

async function main() {
    console.log('='.repeat(50));
    console.log('Bouncer Email Verification Queue Workers');
    console.log('='.repeat(50));
    
    // Validate required environment variables
    if (!process.env.BOUNCER_API_KEY) {
        console.error('ERROR: BOUNCER_API_KEY environment variable is required');
        process.exit(1);
    }
    
    // Display configuration
    console.log('Configuration:');
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Redis Host: ${process.env.REDIS_HOST || 'localhost'}`);
    console.log(`  Redis Port: ${process.env.REDIS_PORT || 6379}`);
    console.log(`  Bouncer API URL: ${process.env.BOUNCER_API_BASE_URL || 'https://api.usebouncer.com/v1.1'}`);
    console.log(`  Max Concurrent Batches: ${process.env.MAX_CONCURRENT_BATCHES || 15}`);
    console.log(`  Batch Size: ${process.env.BATCH_SIZE || 10000}`);
    console.log('');
    
    try {
        // Start the queue manager
        await queueManager.start();
        
        console.log('✓ Queue workers started successfully');
        console.log('✓ Email verification processor is running with 5 concurrent workers');
        console.log('✓ Rate limiting is active (180 requests/minute)');
        console.log('✓ Health monitoring is active');
        console.log('');
        console.log('Queue workers are now processing jobs...');
        console.log('Press Ctrl+C to stop gracefully');
        
        // Display initial queue stats
        setTimeout(async () => {
            try {
                const stats = await queueManager.getQueueStats();
                console.log('\nInitial Queue Status:');
                console.table(stats);
            } catch (error) {
                console.error('Error getting initial stats:', error);
            }
        }, 2000);
        
    } catch (error) {
        console.error('ERROR: Failed to start queue workers:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
main().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});