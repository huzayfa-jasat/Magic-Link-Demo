/**
 * Circuit Breaker Service for Bouncer Email Verification
 * 
 * Implements the circuit breaker pattern to handle API failures gracefully
 * and prevent cascading failures in the email verification system.
 * 
 * States:
 * - CLOSED: Normal operation, requests are passed through
 * - OPEN: Failure threshold exceeded, requests are blocked
 * - HALF_OPEN: Testing state, single request allowed to test recovery
 */

class CircuitBreaker {
    constructor(options = {}) {
        // Configuration
        this.failureThreshold = options.failureThreshold || 5;
        this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
        
        // State management
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.lastRequestTime = null;
        this.nextAttemptTime = null;
        
        // Success/failure tracking
        this.successCount = 0;
        this.totalRequests = 0;
        
        // Callback handlers
        this.onSuccessCallback = options.onSuccess || (() => {});
        this.onFailureCallback = options.onFailure || (() => {});
        this.onStateChangeCallback = options.onStateChange || (() => {});
        
        // Logging
        this.logger = options.logger || console;
    }

    /**
     * Execute an API call through the circuit breaker
     * @param {Function} apiCall - The API function to execute
     * @param {*} context - Optional context for the API call
     * @returns {Promise<*>} - The result of the API call
     */
    async executeApiCall(apiCall, context = null) {
        // Check if circuit breaker should allow the request
        const canExecute = await this.canExecuteRequest();
        
        if (!canExecute) {
            const error = new Error('Circuit breaker is OPEN - request blocked');
            error.circuitBreakerState = this.state;
            error.nextAttemptTime = this.nextAttemptTime;
            throw error;
        }

        this.totalRequests++;
        this.lastRequestTime = Date.now();

        try {
            // Execute the API call
            const startTime = Date.now();
            const result = await apiCall(context);
            const duration = Date.now() - startTime;
            
            // Record success
            await this.onSuccess(duration);
            
            return result;
        } catch (error) {
            // Record failure
            await this.onFailure(error);
            throw error;
        }
    }

    /**
     * Check if the circuit breaker should allow a request
     * @returns {boolean} - True if request should be allowed
     */
    async canExecuteRequest() {
        const now = Date.now();

        switch (this.state) {
            case 'CLOSED':
                return true;

            case 'OPEN':
                // Check if recovery timeout has passed
                if (now - this.lastFailureTime >= this.recoveryTimeout) {
                    await this.changeState('HALF_OPEN');
                    return true;
                }
                return false;

            case 'HALF_OPEN':
                // Only allow one request in HALF_OPEN state
                return true;

            default:
                return false;
        }
    }

    /**
     * Handle successful API call
     * @param {number} duration - Duration of the API call in milliseconds
     */
    async onSuccess(duration) {
        this.successCount++;
        
        // Reset failure count on success
        if (this.state === 'HALF_OPEN') {
            // Recovery successful, close the circuit
            await this.changeState('CLOSED');
            this.failureCount = 0;
        } else if (this.state === 'CLOSED') {
            // Reset failure count periodically in CLOSED state
            if (this.failureCount > 0) {
                this.failureCount = Math.max(0, this.failureCount - 1);
            }
        }

        // Call success callback
        await this.onSuccessCallback({
            state: this.state,
            duration,
            successCount: this.successCount,
            totalRequests: this.totalRequests
        });

        this.logger.debug(`Circuit breaker SUCCESS: state=${this.state}, duration=${duration}ms, failures=${this.failureCount}`);
    }

    /**
     * Handle failed API call
     * @param {Error} error - The error that occurred
     */
    async onFailure(error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        // Determine if failure should open the circuit
        if (this.state === 'HALF_OPEN') {
            // Failure in HALF_OPEN state - go back to OPEN
            await this.changeState('OPEN');
            this.nextAttemptTime = Date.now() + this.recoveryTimeout;
        } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
            // Failure threshold exceeded - open the circuit
            await this.changeState('OPEN');
            this.nextAttemptTime = Date.now() + this.recoveryTimeout;
        }

        // Call failure callback
        await this.onFailureCallback({
            state: this.state,
            error,
            failureCount: this.failureCount,
            totalRequests: this.totalRequests,
            nextAttemptTime: this.nextAttemptTime
        });

        this.logger.error(`Circuit breaker FAILURE: state=${this.state}, failures=${this.failureCount}, error=${error.message}`);
    }

    /**
     * Change the circuit breaker state
     * @param {string} newState - The new state (CLOSED, OPEN, HALF_OPEN)
     */
    async changeState(newState) {
        const oldState = this.state;
        this.state = newState;

        // Call state change callback
        await this.onStateChangeCallback({
            oldState,
            newState,
            failureCount: this.failureCount,
            timestamp: Date.now()
        });

        this.logger.info(`Circuit breaker state changed: ${oldState} -> ${newState}`);
    }

    /**
     * Get current circuit breaker statistics
     * @returns {Object} - Current stats
     */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalRequests: this.totalRequests,
            failureThreshold: this.failureThreshold,
            recoveryTimeout: this.recoveryTimeout,
            lastFailureTime: this.lastFailureTime,
            lastRequestTime: this.lastRequestTime,
            nextAttemptTime: this.nextAttemptTime,
            uptime: this.totalRequests > 0 ? (this.successCount / this.totalRequests) * 100 : 0
        };
    }

    /**
     * Reset the circuit breaker to initial state
     */
    async reset() {
        await this.changeState('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
        this.totalRequests = 0;
        this.lastFailureTime = null;
        this.lastRequestTime = null;
        this.nextAttemptTime = null;
        
        this.logger.info('Circuit breaker reset to initial state');
    }

    /**
     * Force open the circuit breaker
     */
    async forceOpen() {
        await this.changeState('OPEN');
        this.nextAttemptTime = Date.now() + this.recoveryTimeout;
        this.logger.warn('Circuit breaker forced to OPEN state');
    }

    /**
     * Force close the circuit breaker
     */
    async forceClose() {
        await this.changeState('CLOSED');
        this.failureCount = 0;
        this.nextAttemptTime = null;
        this.logger.warn('Circuit breaker forced to CLOSED state');
    }

    /**
     * Check if the circuit breaker is healthy
     * @returns {boolean} - True if healthy
     */
    isHealthy() {
        return this.state === 'CLOSED' && this.failureCount < this.failureThreshold;
    }

    /**
     * Get time until next attempt is allowed (in milliseconds)
     * @returns {number} - Milliseconds until next attempt, or 0 if immediate
     */
    getTimeUntilNextAttempt() {
        if (this.state !== 'OPEN' || !this.nextAttemptTime) {
            return 0;
        }
        
        return Math.max(0, this.nextAttemptTime - Date.now());
    }

    /**
     * Create a circuit breaker with predefined settings for Bouncer API
     * @param {Object} options - Override options
     * @returns {CircuitBreaker} - Configured circuit breaker instance
     */
    static createForBouncerApi(options = {}) {
        const defaultOptions = {
            failureThreshold: 5,
            recoveryTimeout: 60000, // 1 minute
            monitoringPeriod: 60000, // 1 minute
            onSuccess: async (data) => {
                // Log successful API calls for monitoring
                console.log(`Bouncer API success: ${data.duration}ms`);
            },
            onFailure: async (data) => {
                // Log failed API calls for monitoring
                console.error(`Bouncer API failure: ${data.error.message} (${data.failureCount} failures)`);
            },
            onStateChange: async (data) => {
                // Log state changes for monitoring
                console.warn(`Bouncer API circuit breaker: ${data.oldState} -> ${data.newState}`);
                
                // You could add additional monitoring here:
                // - Send alerts
                // - Update metrics
                // - Notify monitoring systems
            }
        };

        return new CircuitBreaker({
            ...defaultOptions,
            ...options
        });
    }
}

module.exports = {
    CircuitBreaker
};