/**
 * Bouncer API Client Usage Examples
 * 
 * This file demonstrates how to use the BouncerAPI client for various operations.
 * Remove this file after implementation is complete.
 */

const { BouncerAPI, RateLimiter } = require('./bouncer-api');

// Example usage
async function demonstrateBouncerAPI() {
    try {
        // Initialize the API client
        const bouncer = new BouncerAPI({
            timeout: 30000,
            maxRetries: 3,
            logger: console
        });
        
        // Example 1: Verify a single email (for testing)
        console.log('=== Single Email Verification ===');
        const singleResult = await bouncer.verifySingleEmail('test@example.com');
        console.log('Single email result:', singleResult);
        
        // Example 2: Create a batch for verification
        console.log('\n=== Batch Creation ===');
        const emails = [
            'john@example.com',
            'jane@example.com',
            'test@gmail.com',
            'user@yahoo.com'
        ];
        
        const batch = await bouncer.createBatch(emails, {
            useDeepCatchAll: false,
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0...'
        });
        
        console.log('Batch created:', {
            id: batch.id,
            status: batch.status,
            emailCount: batch.emailCount
        });
        
        // Example 3: Monitor batch status
        console.log('\n=== Batch Status Monitoring ===');
        let batchStatus;
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            batchStatus = await bouncer.getBatchStatus(batch.id);
            attempts++;
            
            console.log(`Attempt ${attempts}: Status = ${batchStatus.status}, Progress = ${batchStatus.progress}%`);
            
        } while (batchStatus.status !== 'completed' && batchStatus.status !== 'failed' && attempts < maxAttempts);
        
        // Example 4: Download results when batch is complete
        if (batchStatus.status === 'completed') {
            console.log('\n=== Downloading Results ===');
            const results = await bouncer.downloadBatchResults(batch.id);
            
            console.log('Results downloaded:', {
                count: results.length,
                sample: results.slice(0, 2) // Show first 2 results
            });
            
            // Process results
            results.forEach(result => {
                console.log(`${result.email}: ${result.status} (Score: ${result.score})`);
            });
        }
        
        // Example 5: Check account information
        console.log('\n=== Account Information ===');
        const accountInfo = await bouncer.getAccountInfo();
        console.log('Account info:', {
            credits: accountInfo.credits,
            tier: accountInfo.tier
        });
        
        // Example 6: Health check
        console.log('\n=== Health Check ===');
        const health = await bouncer.healthCheck();
        console.log('Health status:', health);
        
    } catch (error) {
        console.error('Error in demonstration:', error);
    }
}

// Example: Rate Limiter Usage
async function demonstrateRateLimiter() {
    console.log('\n=== Rate Limiter Demo ===');
    
    // Create a rate limiter (10 requests per minute for demo)
    const rateLimiter = new RateLimiter(10, 60000);
    
    // Simulate making requests
    for (let i = 0; i < 15; i++) {
        if (rateLimiter.canMakeRequest()) {
            rateLimiter.recordRequest();
            console.log(`Request ${i + 1}: Allowed`);
        } else {
            const waitTime = rateLimiter.getTimeUntilNextRequest();
            console.log(`Request ${i + 1}: Rate limited, wait ${waitTime}ms`);
        }
        
        // Show current stats
        const stats = rateLimiter.getUsageStats();
        console.log(`  Current usage: ${stats.currentRequests}/${stats.maxRequests} (${stats.utilizationPercent.toFixed(1)}%)`);
    }
}

// Example: Error Handling
async function demonstrateErrorHandling() {
    console.log('\n=== Error Handling Demo ===');
    
    const bouncer = new BouncerAPI({
        // Use invalid API key to trigger authentication error
        normalApiKey: 'invalid-key-for-demo'
    });
    
    try {
        await bouncer.verifySingleEmail('test@example.com');
    } catch (error) {
        console.log('Expected error caught:', {
            message: error.message,
            type: error.type,
            status: error.status,
            retryable: error.retryable
        });
    }
}

// Example: Batch Processing with Error Recovery
async function demonstrateBatchProcessing() {
    console.log('\n=== Batch Processing with Error Recovery ===');
    
    const bouncer = new BouncerAPI();
    
    // Large batch processing
    const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
    
    try {
        console.log(`Processing ${emails.length} emails...`);
        
        const batch = await bouncer.createBatch(emails);
        console.log('Batch created successfully:', batch.id);
        
        // Poll for completion
        let isComplete = false;
        while (!isComplete) {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
            
            const status = await bouncer.getBatchStatus(batch.id);
            console.log(`Batch ${batch.id}: ${status.status} (${status.progress}%)`);
            
            if (status.status === 'completed') {
                isComplete = true;
                
                // Download and process results
                const results = await bouncer.downloadBatchResults(batch.id);
                console.log(`Results downloaded: ${results.length} emails processed`);
                
                // Categorize results
                const categories = results.reduce((acc, result) => {
                    acc[result.status] = (acc[result.status] || 0) + 1;
                    return acc;
                }, {});
                
                console.log('Result categories:', categories);
            } else if (status.status === 'failed') {
                console.error('Batch processing failed:', status.error);
                break;
            }
        }
        
    } catch (error) {
        console.error('Batch processing error:', error);
        
        // Check circuit breaker status
        const circuitStatus = bouncer.getCircuitBreakerStatus();
        console.log('Circuit breaker status:', circuitStatus);
    }
}

// Run demonstrations if this file is executed directly
if (require.main === module) {
    console.log('Starting Bouncer API Client Demonstrations...\n');
    
    (async () => {
        await demonstrateBouncerAPI();
        await demonstrateRateLimiter();
        await demonstrateErrorHandling();
        // await demonstrateBatchProcessing(); // Uncomment to test with real API
    })().catch(console.error);
}

module.exports = {
    demonstrateBouncerAPI,
    demonstrateRateLimiter,
    demonstrateErrorHandling,
    demonstrateBatchProcessing
};