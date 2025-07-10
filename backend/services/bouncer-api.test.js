/**
 * Test file for Bouncer API Client
 * 
 * Run with: node bouncer-api.test.js
 * Or integrate with your testing framework
 */

const { BouncerAPI, RateLimiter } = require('./bouncer-api');

// Mock fetch for testing
const originalFetch = global.fetch;

// Test utilities
function mockFetch(responses) {
    let callCount = 0;
    global.fetch = jest.fn || function(url, options) {
        const response = responses[callCount] || responses[responses.length - 1];
        callCount++;
        
        return Promise.resolve({
            ok: response.ok !== false,
            status: response.status || 200,
            statusText: response.statusText || 'OK',
            json: () => Promise.resolve(response.data || {}),
            text: () => Promise.resolve(response.text || JSON.stringify(response.data || {}))
        });
    };
}

function restoreFetch() {
    global.fetch = originalFetch;
}

// Test suite
async function runTests() {
    console.log('Running Bouncer API Client Tests...\n');
    
    let passedTests = 0;
    let totalTests = 0;
    
    function test(name, testFn) {
        totalTests++;
        return testFn()
            .then(() => {
                console.log(`✅ ${name}`);
                passedTests++;
            })
            .catch(error => {
                console.error(`❌ ${name}: ${error.message}`);
            });
    }
    
    // Test 1: Constructor validation
    await test('Constructor should validate API keys', async () => {
        try {
            new BouncerAPI({ normalApiKey: null });
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('BOUNCER_API_KEY_NORMAL is required')) {
                throw error;
            }
        }
    });
    
    // Test 2: Create batch validation
    await test('Create batch should validate email input', async () => {
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        
        try {
            await api.createBatch([]);
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('non-empty array')) {
                throw error;
            }
        }
        
        try {
            await api.createBatch(['invalid-email']);
            throw new Error('Should have thrown error');
        } catch (error) {
            if (!error.message.includes('Invalid email format')) {
                throw error;
            }
        }
    });
    
    // Test 3: Successful batch creation
    await test('Create batch should work with valid emails', async () => {
        mockFetch([{
            ok: true,
            data: {
                id: 'batch-123',
                status: 'queued',
                emailCount: 2,
                estimatedProcessingTime: 300
            }
        }]);
        
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        const result = await api.createBatch(['test@example.com', 'user@domain.com']);
        
        if (result.id !== 'batch-123') {
            throw new Error('Unexpected batch ID');
        }
        
        restoreFetch();
    });
    
    // Test 4: Batch status check
    await test('Get batch status should work', async () => {
        mockFetch([{
            ok: true,
            data: {
                id: 'batch-123',
                status: 'completed',
                progress: 100
            }
        }]);
        
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        const result = await api.getBatchStatus('batch-123');
        
        if (result.status !== 'completed') {
            throw new Error('Unexpected batch status');
        }
        
        restoreFetch();
    });
    
    // Test 5: Download results
    await test('Download batch results should work', async () => {
        mockFetch([{
            ok: true,
            data: [
                {
                    email: 'test@example.com',
                    status: 'deliverable',
                    score: 99
                },
                {
                    email: 'user@domain.com',
                    status: 'undeliverable',
                    score: 15
                }
            ]
        }]);
        
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        const results = await api.downloadBatchResults('batch-123');
        
        if (results.length !== 2) {
            throw new Error('Unexpected results count');
        }
        
        restoreFetch();
    });
    
    // Test 6: Error handling
    await test('Should handle API errors correctly', async () => {
        mockFetch([{
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            data: { error: 'Invalid API key' }
        }]);
        
        const api = new BouncerAPI({ normalApiKey: 'invalid-key' });
        
        try {
            await api.verifySingleEmail('test@example.com');
            throw new Error('Should have thrown error');
        } catch (error) {
            if (error.status !== 401) {
                throw new Error('Expected 401 error');
            }
        }
        
        restoreFetch();
    });
    
    // Test 7: Rate limiter
    await test('Rate limiter should work correctly', async () => {
        const rateLimiter = new RateLimiter(3, 1000); // 3 requests per second
        
        // Should allow first 3 requests
        for (let i = 0; i < 3; i++) {
            if (!rateLimiter.canMakeRequest()) {
                throw new Error(`Request ${i + 1} should be allowed`);
            }
            rateLimiter.recordRequest();
        }
        
        // Should block 4th request
        if (rateLimiter.canMakeRequest()) {
            throw new Error('4th request should be blocked');
        }
        
        const stats = rateLimiter.getUsageStats();
        if (stats.currentRequests !== 3) {
            throw new Error('Expected 3 current requests');
        }
    });
    
    // Test 8: Circuit breaker
    await test('Circuit breaker should work', async () => {
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        
        // Initial state should be closed
        const initialStatus = api.getCircuitBreakerStatus();
        if (initialStatus.state !== 'CLOSED') {
            throw new Error('Circuit breaker should start closed');
        }
        
        // Reset circuit breaker
        api.resetCircuitBreaker();
        const resetStatus = api.getCircuitBreakerStatus();
        if (resetStatus.state !== 'CLOSED' || resetStatus.failureCount !== 0) {
            throw new Error('Circuit breaker should be reset');
        }
    });
    
    // Test 9: Health check
    await test('Health check should work', async () => {
        mockFetch([{
            ok: true,
            data: {
                credits: 1000,
                tier: 'premium'
            }
        }]);
        
        const api = new BouncerAPI({ normalApiKey: 'test-key' });
        const health = await api.healthCheck();
        
        if (health.status !== 'healthy') {
            throw new Error('Health check should return healthy');
        }
        
        restoreFetch();
    });
    
    // Test 10: Retry logic
    await test('Should retry on temporary failures', async () => {
        let callCount = 0;
        mockFetch([
            { ok: false, status: 500, data: { error: 'Server error' } },
            { ok: false, status: 502, data: { error: 'Bad gateway' } },
            { ok: true, data: { credits: 1000, tier: 'premium' } }
        ]);
        
        const api = new BouncerAPI({ 
            normalApiKey: 'test-key',
            maxRetries: 3,
            retryDelay: 100
        });
        
        const result = await api.getAccountInfo();
        
        if (!result.credits) {
            throw new Error('Should have succeeded after retries');
        }
        
        restoreFetch();
    });
    
    // Summary
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${passedTests}/${totalTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed!');
    } else {
        console.log('❌ Some tests failed.');
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };