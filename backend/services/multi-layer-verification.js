/**
 * Multi-Layer Verification Service
 * 
 * This service implements a multi-layer verification strategy for Bouncer email verification.
 * It performs basic verification as the first pass, then identifies risky emails and 
 * performs deep verification for enhanced accuracy.
 * 
 * Multi-Layer Strategy:
 * 1. Basic Verification - Standard verification for all emails
 * 2. Risk Identification - Identify catch-all and low-score emails
 * 3. Deep Verification - Enhanced verification for risky emails
 * 4. Results Processing - Combine and process all results
 */

const BouncerApiService = require('./bouncer-api');
const BouncerDbService = require('./bouncer-db');
const RateLimiter = require('./rate-limiter');

/**
 * Custom error class for multi-layer verification operations
 */
class MultiLayerVerificationError extends Error {
    constructor(message, code = 'MULTI_LAYER_ERROR', details = {}) {
        super(message);
        this.name = 'MultiLayerVerificationError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Logger utility for consistent logging
 */
const logger = {
    info: (message, data = {}) => console.log(`[MULTI-LAYER-VERIFICATION] INFO: ${message}`, data),
    warn: (message, data = {}) => console.warn(`[MULTI-LAYER-VERIFICATION] WARN: ${message}`, data),
    error: (message, error = {}) => console.error(`[MULTI-LAYER-VERIFICATION] ERROR: ${message}`, error),
    debug: (message, data = {}) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MULTI-LAYER-VERIFICATION] DEBUG: ${message}`, data);
        }
    }
};

/**
 * Multi-Layer Verification Service Class
 */
class MultiLayerVerificationService {
    constructor() {
        this.bouncerApi = new BouncerApiService();
        this.db = BouncerDbService;
        this.rateLimiter = new RateLimiter();
        
        // Configuration
        this.config = {
            riskyScoreThreshold: 70,
            catchAllRetryDelay: 300000, // 5 minutes
            maxRetries: 3,
            batchSize: 10000,
            deepVerificationMode: 'enhanced', // enhanced mode for risky emails
            processingTimeout: 1800000 // 30 minutes
        };
    }

    /**
     * Process basic verification for all emails
     * @param {Array} emails - Array of email objects
     * @param {number} userId - User ID
     * @param {number} requestId - Request ID
     * @returns {Promise<Object>} Basic verification results
     */
    async processBasicVerification(emails, userId, requestId) {
        try {
            logger.info('Starting basic verification', { 
                emailCount: emails.length, 
                userId, 
                requestId 
            });

            // Validate inputs
            if (!Array.isArray(emails) || emails.length === 0) {
                throw new MultiLayerVerificationError('Emails must be a non-empty array', 'VALIDATION_ERROR');
            }

            // Check rate limits
            if (!(await this.rateLimiter.canMakeApiCall())) {
                const nextAvailable = await this.rateLimiter.getNextAvailableTime();
                const delay = nextAvailable.getTime() - Date.now();
                
                logger.warn('Rate limit hit during basic verification', { 
                    delay, 
                    nextAvailable: nextAvailable.toISOString() 
                });
                
                throw new MultiLayerVerificationError(
                    'Rate limit exceeded', 
                    'RATE_LIMIT_EXCEEDED', 
                    { delay, nextAvailable }
                );
            }

            // Create batch for basic verification
            const batch = await this.bouncerApi.createBatch(emails, userId, requestId);
            await this.rateLimiter.recordApiCall();

            logger.info('Basic verification batch created', { 
                batchId: batch.batch_id, 
                quantity: batch.quantity 
            });

            // Monitor batch status
            const results = await this.monitorBatchCompletion(batch.batch_id);
            
            logger.info('Basic verification completed', { 
                batchId: batch.batch_id, 
                resultsCount: results.length 
            });

            return {
                batchId: batch.batch_id,
                internalBatchId: batch.id,
                results: results,
                status: 'completed',
                verificationLevel: 'basic'
            };

        } catch (error) {
            logger.error('Basic verification failed', { 
                error: error.message, 
                emailCount: emails.length, 
                userId, 
                requestId 
            });
            
            if (error instanceof MultiLayerVerificationError) {
                throw error;
            }
            
            throw new MultiLayerVerificationError(
                'Basic verification failed', 
                'BASIC_VERIFICATION_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Process deep verification for risky emails
     * @param {Array} riskyEmails - Array of risky email objects
     * @param {number} userId - User ID
     * @param {number} requestId - Request ID
     * @returns {Promise<Object>} Deep verification results
     */
    async processDeepVerification(riskyEmails, userId, requestId) {
        try {
            logger.info('Starting deep verification', { 
                riskyEmailCount: riskyEmails.length, 
                userId, 
                requestId 
            });

            if (!Array.isArray(riskyEmails) || riskyEmails.length === 0) {
                logger.info('No risky emails for deep verification');
                return {
                    results: [],
                    status: 'completed',
                    verificationLevel: 'deep'
                };
            }

            // Add delay for catch-all emails to allow for proper verification
            await new Promise(resolve => setTimeout(resolve, this.config.catchAllRetryDelay));

            // Check rate limits again
            if (!(await this.rateLimiter.canMakeApiCall())) {
                const nextAvailable = await this.rateLimiter.getNextAvailableTime();
                const delay = nextAvailable.getTime() - Date.now();
                
                logger.warn('Rate limit hit during deep verification', { 
                    delay, 
                    nextAvailable: nextAvailable.toISOString() 
                });
                
                throw new MultiLayerVerificationError(
                    'Rate limit exceeded', 
                    'RATE_LIMIT_EXCEEDED', 
                    { delay, nextAvailable }
                );
            }

            // Create deep verification batch with enhanced mode
            const deepBatch = await this.createDeepVerificationBatch(riskyEmails, userId, requestId);
            await this.rateLimiter.recordApiCall();

            logger.info('Deep verification batch created', { 
                batchId: deepBatch.batch_id, 
                quantity: deepBatch.quantity 
            });

            // Monitor deep verification batch
            const deepResults = await this.monitorBatchCompletion(deepBatch.batch_id);
            
            logger.info('Deep verification completed', { 
                batchId: deepBatch.batch_id, 
                resultsCount: deepResults.length 
            });

            return {
                batchId: deepBatch.batch_id,
                internalBatchId: deepBatch.id,
                results: deepResults,
                status: 'completed',
                verificationLevel: 'deep'
            };

        } catch (error) {
            logger.error('Deep verification failed', { 
                error: error.message, 
                riskyEmailCount: riskyEmails.length, 
                userId, 
                requestId 
            });
            
            if (error instanceof MultiLayerVerificationError) {
                throw error;
            }
            
            throw new MultiLayerVerificationError(
                'Deep verification failed', 
                'DEEP_VERIFICATION_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Identify risky emails that require deep verification
     * @param {Array} basicResults - Results from basic verification
     * @returns {Array} Array of risky email objects
     */
    identifyRiskyEmails(basicResults) {
        try {
            logger.info('Identifying risky emails', { basicResultsCount: basicResults.length });

            const riskyEmails = basicResults.filter(result => {
                // Identify catch-all emails
                if (result.status === 'catch-all' || result.bouncer_status === 'catch-all') {
                    return true;
                }
                
                // Identify low-score emails
                if (result.score !== null && result.score !== undefined && result.score < this.config.riskyScoreThreshold) {
                    return true;
                }
                
                // Identify unknown status emails
                if (result.status === 'unknown' || result.bouncer_status === 'unknown') {
                    return true;
                }
                
                // Identify emails with risky reasons
                const riskyReasons = [
                    'risky',
                    'disposable',
                    'role',
                    'accept_all',
                    'timeout',
                    'dns_error'
                ];
                
                if (result.reason && riskyReasons.some(reason => 
                    result.reason.toLowerCase().includes(reason)
                )) {
                    return true;
                }
                
                return false;
            });

            logger.info('Risky emails identified', { 
                riskyCount: riskyEmails.length, 
                totalCount: basicResults.length,
                riskyPercentage: ((riskyEmails.length / basicResults.length) * 100).toFixed(2)
            });

            return riskyEmails;

        } catch (error) {
            logger.error('Failed to identify risky emails', { 
                error: error.message, 
                basicResultsCount: basicResults.length 
            });
            
            throw new MultiLayerVerificationError(
                'Failed to identify risky emails', 
                'IDENTIFY_RISKY_EMAILS_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Process multi-layer verification combining basic and deep verification
     * @param {Array} emails - Array of email objects
     * @param {number} userId - User ID
     * @param {number} requestId - Request ID
     * @returns {Promise<Object>} Combined verification results
     */
    async processMultiLayerVerification(emails, userId, requestId) {
        try {
            logger.info('Starting multi-layer verification', { 
                emailCount: emails.length, 
                userId, 
                requestId 
            });

            const startTime = Date.now();
            
            // Step 1: Basic verification
            const basicVerification = await this.processBasicVerification(emails, userId, requestId);
            
            // Step 2: Identify risky emails
            const riskyEmails = this.identifyRiskyEmails(basicVerification.results);
            
            // Step 3: Deep verification for risky emails (if any)
            let deepVerification = null;
            if (riskyEmails.length > 0) {
                // Convert risky results back to email objects for deep verification
                const riskyEmailObjects = riskyEmails.map(result => ({
                    email: result.email,
                    name: result.name || '',
                    globalId: result.global_id
                }));
                
                deepVerification = await this.processDeepVerification(riskyEmailObjects, userId, requestId);
            }
            
            // Step 4: Combine results
            const combinedResults = await this.combineVerificationResults(
                basicVerification.results, 
                deepVerification ? deepVerification.results : []
            );
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            logger.info('Multi-layer verification completed', { 
                emailCount: emails.length,
                riskyCount: riskyEmails.length,
                basicBatchId: basicVerification.batchId,
                deepBatchId: deepVerification ? deepVerification.batchId : null,
                processingTimeMs: processingTime,
                finalResultsCount: combinedResults.length
            });

            return {
                status: 'completed',
                processingTime: processingTime,
                basicVerification: {
                    batchId: basicVerification.batchId,
                    resultsCount: basicVerification.results.length
                },
                deepVerification: deepVerification ? {
                    batchId: deepVerification.batchId,
                    resultsCount: deepVerification.results.length
                } : null,
                riskyEmailsCount: riskyEmails.length,
                results: combinedResults,
                summary: this.generateVerificationSummary(combinedResults)
            };

        } catch (error) {
            logger.error('Multi-layer verification failed', { 
                error: error.message, 
                emailCount: emails.length, 
                userId, 
                requestId 
            });
            
            if (error instanceof MultiLayerVerificationError) {
                throw error;
            }
            
            throw new MultiLayerVerificationError(
                'Multi-layer verification failed', 
                'MULTI_LAYER_VERIFICATION_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Create deep verification batch with enhanced parameters
     * @param {Array} emails - Array of email objects
     * @param {number} userId - User ID
     * @param {number} requestId - Request ID
     * @returns {Promise<Object>} Created batch information
     */
    async createDeepVerificationBatch(emails, userId, requestId) {
        try {
            // Prepare emails for deep verification with enhanced parameters
            const enhancedEmails = emails.map(email => ({
                email: email.email,
                name: email.name || '',
                // Add enhanced verification parameters
                verification_mode: 'enhanced',
                timeout: 30,
                retry_count: 2
            }));

            return await this.bouncerApi.createBatch(enhancedEmails, userId, requestId);

        } catch (error) {
            logger.error('Failed to create deep verification batch', { 
                error: error.message, 
                emailCount: emails.length 
            });
            
            throw new MultiLayerVerificationError(
                'Failed to create deep verification batch', 
                'CREATE_DEEP_BATCH_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Monitor batch completion with timeout
     * @param {string} batchId - Bouncer API batch ID
     * @returns {Promise<Array>} Batch results
     */
    async monitorBatchCompletion(batchId) {
        const startTime = Date.now();
        const timeout = this.config.processingTimeout;
        
        while (Date.now() - startTime < timeout) {
            try {
                // Check rate limits before status check
                if (!(await this.rateLimiter.canMakeApiCall())) {
                    const nextAvailable = await this.rateLimiter.getNextAvailableTime();
                    const delay = nextAvailable.getTime() - Date.now();
                    
                    logger.warn('Rate limit hit during batch monitoring', { 
                        batchId, 
                        delay 
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, Math.max(delay, 0)));
                    continue;
                }

                const status = await this.bouncerApi.getBatchStatus(batchId);
                await this.rateLimiter.recordApiCall();

                if (status.status === 'completed') {
                    logger.info('Batch completed, downloading results', { batchId });
                    
                    // Check rate limits before download
                    if (!(await this.rateLimiter.canMakeApiCall())) {
                        const nextAvailable = await this.rateLimiter.getNextAvailableTime();
                        const delay = nextAvailable.getTime() - Date.now();
                        await new Promise(resolve => setTimeout(resolve, Math.max(delay, 0)));
                    }
                    
                    const results = await this.bouncerApi.downloadBatchResults(batchId);
                    await this.rateLimiter.recordApiCall();
                    
                    return results;
                    
                } else if (status.status === 'failed') {
                    throw new MultiLayerVerificationError(
                        `Batch failed: ${status.error}`, 
                        'BATCH_FAILED', 
                        { batchId, status }
                    );
                }

                // Wait before next check
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
                
            } catch (error) {
                if (error instanceof MultiLayerVerificationError) {
                    throw error;
                }
                
                logger.error('Error monitoring batch', { 
                    error: error.message, 
                    batchId 
                });
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
            }
        }

        throw new MultiLayerVerificationError(
            'Batch monitoring timeout', 
            'BATCH_TIMEOUT', 
            { batchId, timeout }
        );
    }

    /**
     * Combine basic and deep verification results
     * @param {Array} basicResults - Results from basic verification
     * @param {Array} deepResults - Results from deep verification
     * @returns {Promise<Array>} Combined results
     */
    async combineVerificationResults(basicResults, deepResults) {
        try {
            logger.info('Combining verification results', { 
                basicCount: basicResults.length, 
                deepCount: deepResults.length 
            });

            // Create a map of deep results by email for easy lookup
            const deepResultsMap = new Map();
            deepResults.forEach(result => {
                deepResultsMap.set(result.email, result);
            });

            // Combine results, preferring deep verification results for risky emails
            const combinedResults = basicResults.map(basicResult => {
                const deepResult = deepResultsMap.get(basicResult.email);
                
                if (deepResult) {
                    // Use deep verification result with enhanced data
                    return {
                        ...basicResult,
                        ...deepResult,
                        verification_level: 'deep',
                        basic_status: basicResult.status,
                        basic_score: basicResult.score,
                        enhanced_status: deepResult.status,
                        enhanced_score: deepResult.score,
                        final_status: this.determineFinalStatus(basicResult, deepResult),
                        final_score: this.determineFinalScore(basicResult, deepResult)
                    };
                } else {
                    // Use basic verification result
                    return {
                        ...basicResult,
                        verification_level: 'basic',
                        final_status: basicResult.status,
                        final_score: basicResult.score
                    };
                }
            });

            logger.info('Verification results combined', { 
                combinedCount: combinedResults.length,
                deepEnhancedCount: deepResults.length
            });

            return combinedResults;

        } catch (error) {
            logger.error('Failed to combine verification results', { 
                error: error.message, 
                basicCount: basicResults.length, 
                deepCount: deepResults.length 
            });
            
            throw new MultiLayerVerificationError(
                'Failed to combine verification results', 
                'COMBINE_RESULTS_ERROR', 
                { originalError: error }
            );
        }
    }

    /**
     * Determine final status from basic and deep verification
     * @param {Object} basicResult - Basic verification result
     * @param {Object} deepResult - Deep verification result
     * @returns {string} Final status
     */
    determineFinalStatus(basicResult, deepResult) {
        // Priority order: deliverable > undeliverable > catch-all > unknown
        if (deepResult.status === 'deliverable' || basicResult.status === 'deliverable') {
            return 'deliverable';
        }
        
        if (deepResult.status === 'undeliverable' || basicResult.status === 'undeliverable') {
            return 'undeliverable';
        }
        
        if (deepResult.status === 'catch-all' || basicResult.status === 'catch-all') {
            return 'catch-all';
        }
        
        return 'unknown';
    }

    /**
     * Determine final score from basic and deep verification
     * @param {Object} basicResult - Basic verification result
     * @param {Object} deepResult - Deep verification result
     * @returns {number} Final score
     */
    determineFinalScore(basicResult, deepResult) {
        const basicScore = basicResult.score || 0;
        const deepScore = deepResult.score || 0;
        
        // Use the higher confidence score
        return Math.max(basicScore, deepScore);
    }

    /**
     * Generate verification summary statistics
     * @param {Array} results - Combined verification results
     * @returns {Object} Summary statistics
     */
    generateVerificationSummary(results) {
        const summary = {
            total: results.length,
            deliverable: 0,
            undeliverable: 0,
            catch_all: 0,
            unknown: 0,
            enhanced_count: 0,
            avg_score: 0,
            high_confidence: 0
        };

        let totalScore = 0;
        let scoredCount = 0;

        results.forEach(result => {
            // Count by final status
            switch (result.final_status) {
                case 'deliverable':
                    summary.deliverable++;
                    break;
                case 'undeliverable':
                    summary.undeliverable++;
                    break;
                case 'catch-all':
                    summary.catch_all++;
                    break;
                default:
                    summary.unknown++;
            }

            // Count enhanced verifications
            if (result.verification_level === 'deep') {
                summary.enhanced_count++;
            }

            // Calculate average score
            if (result.final_score !== null && result.final_score !== undefined) {
                totalScore += result.final_score;
                scoredCount++;
            }

            // Count high confidence results
            if (result.final_score >= 80) {
                summary.high_confidence++;
            }
        });

        summary.avg_score = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;
        
        // Calculate percentages
        summary.deliverable_pct = ((summary.deliverable / summary.total) * 100).toFixed(1);
        summary.undeliverable_pct = ((summary.undeliverable / summary.total) * 100).toFixed(1);
        summary.catch_all_pct = ((summary.catch_all / summary.total) * 100).toFixed(1);
        summary.unknown_pct = ((summary.unknown / summary.total) * 100).toFixed(1);
        summary.enhanced_pct = ((summary.enhanced_count / summary.total) * 100).toFixed(1);
        summary.high_confidence_pct = ((summary.high_confidence / summary.total) * 100).toFixed(1);

        return summary;
    }
}

module.exports = MultiLayerVerificationService;