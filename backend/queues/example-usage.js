#!/usr/bin/env node

/**
 * Example Usage of Bouncer Email Verification Queue
 * 
 * This script demonstrates how to use the email verification queue system.
 * It shows how to add emails to the queue and monitor processing status.
 */

require('dotenv').config();
const { queueManager } = require('./queue-manager');

async function example() {
    console.log('Bouncer Email Verification Queue - Example Usage');
    console.log('='.repeat(50));
    
    try {
        // Start the queue manager (in production, this would be running separately)
        console.log('Starting queue manager...');
        await queueManager.start();
        
        // Example emails to process
        const emails = [
            { email: 'john.doe@example.com', name: 'John Doe' },
            { email: 'jane.smith@test.com', name: 'Jane Smith' },
            { email: 'invalid@nonexistent.domain', name: 'Invalid User' },
            { email: 'bouncer@gmail.com', name: 'Test User' },
            { email: 'support@usebouncer.com', name: 'Bouncer Support' }
        ];
        
        const userId = 1;
        const requestId = 12345;
        
        console.log(`Adding ${emails.length} emails to the verification queue...`);
        
        // Add emails to queue
        const result = await queueManager.addEmailsToQueue(emails, userId, requestId, {
            priority: 'NORMAL',
            delay: 0
        });
        
        console.log('✓ Emails added to queue successfully');
        console.log(`  Job IDs: ${result.jobIds.join(', ')}`);
        console.log(`  Batch Count: ${result.batchCount}`);
        console.log(`  Total Emails: ${result.totalEmails}`);
        
        // Monitor queue status
        console.log('\nMonitoring queue status...');
        
        let monitoringCount = 0;
        const maxMonitoring = 10; // Monitor for 10 iterations
        
        const monitor = setInterval(async () => {
            try {
                const stats = await queueManager.getQueueStats();
                
                console.log(`\n--- Queue Status (${monitoringCount + 1}/${maxMonitoring}) ---`);
                console.table(stats);
                
                monitoringCount++;
                
                // Check if all jobs are completed or failed
                const totalActive = Object.values(stats).reduce((sum, stat) => sum + stat.active + stat.waiting, 0);
                
                if (totalActive === 0 || monitoringCount >= maxMonitoring) {
                    clearInterval(monitor);
                    console.log('\n✓ Monitoring complete');
                    
                    // Show final stats
                    const finalStats = await queueManager.getQueueStats();
                    console.log('\nFinal Queue Status:');
                    console.table(finalStats);
                    
                    // Get health status
                    const health = await queueManager.getHealthStatus();
                    console.log('\nSystem Health:');
                    console.log(`  Running: ${health.isRunning}`);
                    console.log(`  Active Processors: ${health.activeProcessors.join(', ')}`);
                    console.log(`  Uptime: ${Math.round(health.uptime)}s`);
                    console.log(`  Memory Usage: ${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB`);
                    
                    // Stop the queue manager
                    await queueManager.stop();
                    console.log('\n✓ Queue manager stopped');
                    process.exit(0);
                }
            } catch (error) {
                console.error('Error monitoring queue:', error);
                clearInterval(monitor);
                process.exit(1);
            }
        }, 5000); // Check every 5 seconds
        
    } catch (error) {
        console.error('Example failed:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    try {
        await queueManager.stop();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Run the example
example().catch((error) => {
    console.error('Failed to run example:', error);
    process.exit(1);
});