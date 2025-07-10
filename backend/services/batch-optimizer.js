/**
 * Batch Optimizer Service for Bouncer Email Verification System
 * 
 * This service implements V2 batch composition optimization to improve email verification
 * performance and reduce processing time. The optimizer uses non-homogeneous batch composition
 * by grouping emails by domain and interleaving them to distribute load more evenly.
 * 
 * Key Features:
 * - Non-homogeneous batch composition for better performance
 * - Domain-based grouping and interleaving
 * - Optimization metrics calculation
 * - Production-ready error handling and logging
 * - Support for edge cases (single domain, empty batches)
 * - Configurable batch sizes and optimization parameters
 * 
 * Performance Benefits:
 * - Reduces DNS lookup caching effects
 * - Distributes load across different mail servers
 * - Minimizes timeout clustering for problematic domains
 * - Improves overall batch completion rates
 */

const crypto = require('crypto');
const knex = require('knex')(require('../knexfile.js').development);

class BatchOptimizer {
    constructor(options = {}) {
        // Configuration parameters
        this.maxBatchSize = options.maxBatchSize || 10000;
        this.minBatchSize = options.minBatchSize || 100;
        this.maxDomainsPerBatch = options.maxDomainsPerBatch || 1000;
        this.logger = options.logger || console;
        
        // Optimization parameters
        this.optimizationConfig = {
            // Interleaving strategy
            interleavingStrategy: options.interleavingStrategy || 'round_robin',
            
            // Domain distribution settings
            maxEmailsPerDomain: options.maxEmailsPerDomain || 500,
            minEmailsPerDomain: options.minEmailsPerDomain || 1,
            
            // Performance tuning
            enableDomainHashing: options.enableDomainHashing !== false,
            enableMetricsCollection: options.enableMetricsCollection !== false,
            
            // Cache settings
            domainCacheSize: options.domainCacheSize || 10000,
            cacheExpiryMinutes: options.cacheExpiryMinutes || 30
        };
        
        // Domain statistics cache
        this.domainStatsCache = new Map();
        this.lastCacheCleanup = Date.now();
        
        // Performance metrics
        this.metrics = {
            batchesOptimized: 0,
            totalEmailsProcessed: 0,
            averageOptimizationTime: 0,
            domainDistributionScores: [],
            lastOptimizationTime: null
        };
        
        this.logger.info('BatchOptimizer initialized', {
            maxBatchSize: this.maxBatchSize,
            interleavingStrategy: this.optimizationConfig.interleavingStrategy,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Optimize batch composition for improved email verification performance
     * @param {Array} emails - Array of email objects
     * @param {Object} options - Optimization options
     * @returns {Promise<Object>} - Optimization result with optimized batch and metrics
     */
    async optimizeBatchComposition(emails, options = {}) {
        try {
            const startTime = Date.now();
            
            // Validate input
            if (!Array.isArray(emails) || emails.length === 0) {
                throw new Error('Invalid emails array provided');
            }
            
            if (emails.length > this.maxBatchSize) {
                throw new Error(`Batch size ${emails.length} exceeds maximum ${this.maxBatchSize}`);
            }
            
            this.logger.debug('Starting batch optimization', {
                emailCount: emails.length,
                batchId: options.batchId || 'unknown'
            });
            
            // Group emails by domain
            const domainGroups = await this.groupByDomain(emails);
            
            // Calculate initial metrics
            const initialMetrics = this.calculateInitialMetrics(domainGroups);
            
            // Apply optimization strategy
            const optimizedBatch = await this.distributeNonHomogeneously(
                domainGroups, 
                options.strategy || this.optimizationConfig.interleavingStrategy
            );
            
            // Calculate final metrics
            const finalMetrics = this.calculateOptimizationMetrics(
                emails, 
                optimizedBatch, 
                domainGroups
            );
            
            // Update performance metrics
            const optimizationTime = Date.now() - startTime;
            this.updatePerformanceMetrics(optimizationTime, finalMetrics);
            
            // Store optimization results if requested
            if (options.storeResults && options.batchId) {
                await this.storeOptimizationResults(options.batchId, {
                    originalSize: emails.length,
                    optimizedSize: optimizedBatch.length,
                    domainCount: Object.keys(domainGroups).length,
                    optimizationTime,
                    metrics: finalMetrics
                });
            }
            
            this.logger.info('Batch optimization completed', {
                emailCount: emails.length,
                domainCount: Object.keys(domainGroups).length,
                optimizationTime,
                distributionScore: finalMetrics.distributionScore,
                batchId: options.batchId || 'unknown'
            });
            
            return {
                success: true,
                optimizedEmails: optimizedBatch,
                originalCount: emails.length,
                optimizedCount: optimizedBatch.length,
                domainCount: Object.keys(domainGroups).length,
                optimizationTime,
                metrics: finalMetrics,
                initialMetrics,
                strategy: options.strategy || this.optimizationConfig.interleavingStrategy
            };
            
        } catch (error) {
            this.logger.error('Batch optimization failed', {
                error: error.message,
                emailCount: emails ? emails.length : 0,
                batchId: options.batchId || 'unknown'
            });
            
            throw new Error(`Batch optimization failed: ${error.message}`);
        }
    }

    /**
     * Group emails by domain for optimization
     * @param {Array} emails - Array of email objects
     * @returns {Promise<Object>} - Domain groups object
     */
    async groupByDomain(emails) {
        try {
            const domainGroups = {};
            const domainStats = {};
            
            // Process emails and group by domain
            for (const email of emails) {
                const emailAddress = email.email || email;
                
                // Validate email format
                if (!this.isValidEmail(emailAddress)) {
                    this.logger.warn('Invalid email format detected', { email: emailAddress });
                    continue;
                }
                
                // Extract domain
                const domain = this.extractDomain(emailAddress);
                
                if (!domain) {
                    this.logger.warn('Could not extract domain from email', { email: emailAddress });
                    continue;
                }
                
                // Initialize domain group if not exists
                if (!domainGroups[domain]) {
                    domainGroups[domain] = [];
                    domainStats[domain] = {
                        count: 0,
                        hash: this.generateDomainHash(domain)
                    };
                }
                
                // Add email to domain group
                domainGroups[domain].push({
                    ...email,
                    email: emailAddress,
                    domain: domain,
                    domainHash: domainStats[domain].hash
                });
                
                domainStats[domain].count++;
            }
            
            // Update domain statistics cache
            if (this.optimizationConfig.enableDomainHashing) {
                this.updateDomainStatsCache(domainStats);
            }
            
            // Clean up cache if needed
            this.cleanupCacheIfNeeded();
            
            this.logger.debug('Domain grouping completed', {
                totalDomains: Object.keys(domainGroups).length,
                largestDomain: Math.max(...Object.values(domainStats).map(s => s.count)),
                smallestDomain: Math.min(...Object.values(domainStats).map(s => s.count))
            });
            
            return domainGroups;
            
        } catch (error) {
            this.logger.error('Domain grouping failed', { error: error.message });
            throw new Error(`Domain grouping failed: ${error.message}`);
        }
    }

    /**
     * Distribute emails non-homogeneously using interleaving strategy
     * @param {Object} domainGroups - Domain groups object
     * @param {string} strategy - Interleaving strategy
     * @returns {Promise<Array>} - Optimized email array
     */
    async distributeNonHomogeneously(domainGroups, strategy = 'round_robin') {
        try {
            const domains = Object.keys(domainGroups);
            
            if (domains.length === 0) {
                return [];
            }
            
            // Handle single domain case
            if (domains.length === 1) {
                return this.handleSingleDomain(domainGroups[domains[0]]);
            }
            
            // Apply distribution strategy
            switch (strategy) {
                case 'round_robin':
                    return this.applyRoundRobinDistribution(domainGroups);
                case 'weighted':
                    return this.applyWeightedDistribution(domainGroups);
                case 'random':
                    return this.applyRandomDistribution(domainGroups);
                case 'size_based':
                    return this.applySizeBasedDistribution(domainGroups);
                default:
                    this.logger.warn('Unknown distribution strategy, using round_robin', { strategy });
                    return this.applyRoundRobinDistribution(domainGroups);
            }
            
        } catch (error) {
            this.logger.error('Non-homogeneous distribution failed', { error: error.message });
            throw new Error(`Distribution failed: ${error.message}`);
        }
    }

    /**
     * Apply round-robin distribution strategy
     * @param {Object} domainGroups - Domain groups
     * @returns {Array} - Distributed emails
     */
    applyRoundRobinDistribution(domainGroups) {
        const optimizedBatch = [];
        const domains = Object.keys(domainGroups);
        const domainPointers = {};
        
        // Initialize pointers for each domain
        domains.forEach(domain => {
            domainPointers[domain] = 0;
        });
        
        // Calculate total emails
        const totalEmails = domains.reduce((sum, domain) => 
            sum + domainGroups[domain].length, 0
        );
        
        // Round-robin through domains
        for (let i = 0; i < totalEmails; i++) {
            const domainIndex = i % domains.length;
            const currentDomain = domains[domainIndex];
            
            // Check if current domain has emails left
            if (domainPointers[currentDomain] < domainGroups[currentDomain].length) {
                optimizedBatch.push(domainGroups[currentDomain][domainPointers[currentDomain]]);
                domainPointers[currentDomain]++;
            } else {
                // Find next domain with emails
                let nextDomainFound = false;
                for (let j = 0; j < domains.length; j++) {
                    const nextDomainIndex = (domainIndex + j + 1) % domains.length;
                    const nextDomain = domains[nextDomainIndex];
                    
                    if (domainPointers[nextDomain] < domainGroups[nextDomain].length) {
                        optimizedBatch.push(domainGroups[nextDomain][domainPointers[nextDomain]]);
                        domainPointers[nextDomain]++;
                        nextDomainFound = true;
                        break;
                    }
                }
                
                if (!nextDomainFound) {
                    break; // All domains exhausted
                }
            }
        }
        
        return optimizedBatch;
    }

    /**
     * Apply weighted distribution strategy based on domain sizes
     * @param {Object} domainGroups - Domain groups
     * @returns {Array} - Distributed emails
     */
    applyWeightedDistribution(domainGroups) {
        const optimizedBatch = [];
        const domains = Object.keys(domainGroups);
        
        // Calculate weights based on domain sizes
        const weights = domains.map(domain => ({
            domain,
            weight: domainGroups[domain].length,
            pointer: 0
        }));
        
        // Sort by weight (smallest first for better distribution)
        weights.sort((a, b) => a.weight - b.weight);
        
        // Calculate distribution intervals
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        const intervals = weights.map(w => Math.ceil(totalWeight / w.weight));
        
        // Distribute emails based on intervals
        let globalPointer = 0;
        const totalEmails = totalWeight;
        
        for (let i = 0; i < totalEmails; i++) {
            // Find next domain to take from
            let selectedDomain = null;
            let minInterval = Infinity;
            
            for (let j = 0; j < weights.length; j++) {
                const weight = weights[j];
                if (weight.pointer < weight.weight) {
                    const interval = (weight.pointer + 1) * intervals[j];
                    if (interval <= globalPointer + 1 && interval < minInterval) {
                        minInterval = interval;
                        selectedDomain = weight;
                    }
                }
            }
            
            // If no domain found by interval, pick the first available
            if (!selectedDomain) {
                selectedDomain = weights.find(w => w.pointer < w.weight);
            }
            
            if (selectedDomain) {
                optimizedBatch.push(domainGroups[selectedDomain.domain][selectedDomain.pointer]);
                selectedDomain.pointer++;
                globalPointer++;
            } else {
                break;
            }
        }
        
        return optimizedBatch;
    }

    /**
     * Apply random distribution strategy
     * @param {Object} domainGroups - Domain groups
     * @returns {Array} - Distributed emails
     */
    applyRandomDistribution(domainGroups) {
        const optimizedBatch = [];
        const domains = Object.keys(domainGroups);
        
        // Create a pool of all emails with domain info
        const emailPool = [];
        domains.forEach(domain => {
            domainGroups[domain].forEach(email => {
                emailPool.push({ email, domain });
            });
        });
        
        // Shuffle the pool randomly
        for (let i = emailPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [emailPool[i], emailPool[j]] = [emailPool[j], emailPool[i]];
        }
        
        // Extract emails from shuffled pool
        emailPool.forEach(item => {
            optimizedBatch.push(item.email);
        });
        
        return optimizedBatch;
    }

    /**
     * Apply size-based distribution strategy
     * @param {Object} domainGroups - Domain groups
     * @returns {Array} - Distributed emails
     */
    applySizeBasedDistribution(domainGroups) {
        const optimizedBatch = [];
        const domains = Object.keys(domainGroups);
        
        // Sort domains by size (largest first)
        const sortedDomains = domains.sort((a, b) => 
            domainGroups[b].length - domainGroups[a].length
        );
        
        // Calculate chunk sizes for interleaving
        const chunkSizes = this.calculateChunkSizes(domainGroups, sortedDomains);
        
        // Interleave chunks
        let allProcessed = false;
        const domainPointers = {};
        sortedDomains.forEach(domain => {
            domainPointers[domain] = 0;
        });
        
        while (!allProcessed) {
            let anyProcessed = false;
            
            for (const domain of sortedDomains) {
                const chunkSize = chunkSizes[domain];
                const domainEmails = domainGroups[domain];
                
                for (let i = 0; i < chunkSize && domainPointers[domain] < domainEmails.length; i++) {
                    optimizedBatch.push(domainEmails[domainPointers[domain]]);
                    domainPointers[domain]++;
                    anyProcessed = true;
                }
            }
            
            if (!anyProcessed) {
                allProcessed = true;
            }
        }
        
        return optimizedBatch;
    }

    /**
     * Calculate chunk sizes for size-based distribution
     * @param {Object} domainGroups - Domain groups
     * @param {Array} sortedDomains - Sorted domain names
     * @returns {Object} - Chunk sizes for each domain
     */
    calculateChunkSizes(domainGroups, sortedDomains) {
        const chunkSizes = {};
        const totalEmails = sortedDomains.reduce((sum, domain) => 
            sum + domainGroups[domain].length, 0
        );
        
        // Calculate base chunk size
        const baseChunkSize = Math.ceil(totalEmails / (sortedDomains.length * 10));
        
        sortedDomains.forEach(domain => {
            const domainSize = domainGroups[domain].length;
            
            if (domainSize <= baseChunkSize) {
                chunkSizes[domain] = 1;
            } else if (domainSize <= baseChunkSize * 5) {
                chunkSizes[domain] = Math.ceil(domainSize / 20);
            } else {
                chunkSizes[domain] = Math.ceil(domainSize / 10);
            }
        });
        
        return chunkSizes;
    }

    /**
     * Handle single domain case with internal shuffling
     * @param {Array} emails - Emails from single domain
     * @returns {Array} - Shuffled emails
     */
    handleSingleDomain(emails) {
        // For single domain, we can still optimize by shuffling
        // This helps with any internal patterns in the email list
        const shuffledEmails = [...emails];
        
        for (let i = shuffledEmails.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledEmails[i], shuffledEmails[j]] = [shuffledEmails[j], shuffledEmails[i]];
        }
        
        return shuffledEmails;
    }

    /**
     * Calculate optimization metrics
     * @param {Array} originalEmails - Original email array
     * @param {Array} optimizedEmails - Optimized email array
     * @param {Object} domainGroups - Domain groups
     * @returns {Object} - Optimization metrics
     */
    calculateOptimizationMetrics(originalEmails, optimizedEmails, domainGroups) {
        try {
            const metrics = {
                originalCount: originalEmails.length,
                optimizedCount: optimizedEmails.length,
                domainCount: Object.keys(domainGroups).length,
                distributionScore: 0,
                diversityIndex: 0,
                clusteringScore: 0,
                efficiency: 0
            };
            
            // Calculate distribution score
            metrics.distributionScore = this.calculateDistributionScore(optimizedEmails);
            
            // Calculate diversity index (Shannon entropy)
            metrics.diversityIndex = this.calculateDiversityIndex(domainGroups);
            
            // Calculate clustering score
            metrics.clusteringScore = this.calculateClusteringScore(optimizedEmails);
            
            // Calculate overall efficiency
            metrics.efficiency = (metrics.distributionScore + metrics.diversityIndex + (1 - metrics.clusteringScore)) / 3;
            
            // Domain size statistics
            const domainSizes = Object.values(domainGroups).map(group => group.length);
            metrics.domainSizeStats = {
                min: Math.min(...domainSizes),
                max: Math.max(...domainSizes),
                avg: domainSizes.reduce((sum, size) => sum + size, 0) / domainSizes.length,
                median: this.calculateMedian(domainSizes)
            };
            
            return metrics;
            
        } catch (error) {
            this.logger.error('Metrics calculation failed', { error: error.message });
            return {
                originalCount: originalEmails.length,
                optimizedCount: optimizedEmails.length,
                domainCount: Object.keys(domainGroups).length,
                error: error.message
            };
        }
    }

    /**
     * Calculate initial metrics before optimization
     * @param {Object} domainGroups - Domain groups
     * @returns {Object} - Initial metrics
     */
    calculateInitialMetrics(domainGroups) {
        const domains = Object.keys(domainGroups);
        const totalEmails = domains.reduce((sum, domain) => 
            sum + domainGroups[domain].length, 0
        );
        
        return {
            totalEmails,
            domainCount: domains.length,
            averageEmailsPerDomain: totalEmails / domains.length,
            largestDomainSize: Math.max(...domains.map(d => domainGroups[d].length)),
            smallestDomainSize: Math.min(...domains.map(d => domainGroups[d].length))
        };
    }

    /**
     * Calculate distribution score (0-1, higher is better)
     * @param {Array} emails - Optimized emails
     * @returns {number} - Distribution score
     */
    calculateDistributionScore(emails) {
        if (emails.length === 0) return 0;
        
        const windowSize = Math.min(100, Math.ceil(emails.length / 10));
        let totalScore = 0;
        let windows = 0;
        
        for (let i = 0; i <= emails.length - windowSize; i += windowSize) {
            const window = emails.slice(i, i + windowSize);
            const uniqueDomains = new Set(window.map(email => email.domain)).size;
            const score = uniqueDomains / Math.min(windowSize, window.length);
            totalScore += score;
            windows++;
        }
        
        return windows > 0 ? totalScore / windows : 0;
    }

    /**
     * Calculate diversity index using Shannon entropy
     * @param {Object} domainGroups - Domain groups
     * @returns {number} - Diversity index
     */
    calculateDiversityIndex(domainGroups) {
        const domains = Object.keys(domainGroups);
        const totalEmails = domains.reduce((sum, domain) => 
            sum + domainGroups[domain].length, 0
        );
        
        if (totalEmails === 0) return 0;
        
        let entropy = 0;
        domains.forEach(domain => {
            const p = domainGroups[domain].length / totalEmails;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        });
        
        // Normalize to 0-1 range
        const maxEntropy = Math.log2(domains.length);
        return maxEntropy > 0 ? entropy / maxEntropy : 0;
    }

    /**
     * Calculate clustering score (0-1, lower is better)
     * @param {Array} emails - Optimized emails
     * @returns {number} - Clustering score
     */
    calculateClusteringScore(emails) {
        if (emails.length <= 1) return 0;
        
        let clusterCount = 0;
        let totalTransitions = 0;
        
        for (let i = 1; i < emails.length; i++) {
            if (emails[i].domain === emails[i-1].domain) {
                clusterCount++;
            }
            totalTransitions++;
        }
        
        return totalTransitions > 0 ? clusterCount / totalTransitions : 0;
    }

    /**
     * Calculate median of an array
     * @param {Array} values - Array of numbers
     * @returns {number} - Median value
     */
    calculateMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    }

    /**
     * Extract domain from email address
     * @param {string} email - Email address
     * @returns {string} - Domain name
     */
    extractDomain(email) {
        try {
            const parts = email.split('@');
            return parts.length === 2 ? parts[1].toLowerCase() : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean} - True if valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Generate domain hash for caching
     * @param {string} domain - Domain name
     * @returns {string} - Domain hash
     */
    generateDomainHash(domain) {
        return crypto.createHash('md5').update(domain).digest('hex');
    }

    /**
     * Update domain statistics cache
     * @param {Object} domainStats - Domain statistics
     */
    updateDomainStatsCache(domainStats) {
        try {
            const now = Date.now();
            
            Object.keys(domainStats).forEach(domain => {
                this.domainStatsCache.set(domain, {
                    ...domainStats[domain],
                    timestamp: now
                });
            });
            
            // Limit cache size
            if (this.domainStatsCache.size > this.optimizationConfig.domainCacheSize) {
                const entries = Array.from(this.domainStatsCache.entries());
                entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                
                const toDelete = entries.slice(0, entries.length - this.optimizationConfig.domainCacheSize);
                toDelete.forEach(([domain]) => {
                    this.domainStatsCache.delete(domain);
                });
            }
        } catch (error) {
            this.logger.error('Error updating domain stats cache', { error: error.message });
        }
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCacheIfNeeded() {
        const now = Date.now();
        const cleanupInterval = 5 * 60 * 1000; // 5 minutes
        
        if (now - this.lastCacheCleanup > cleanupInterval) {
            const expiryTime = now - (this.optimizationConfig.cacheExpiryMinutes * 60 * 1000);
            
            for (const [domain, stats] of this.domainStatsCache.entries()) {
                if (stats.timestamp < expiryTime) {
                    this.domainStatsCache.delete(domain);
                }
            }
            
            this.lastCacheCleanup = now;
        }
    }

    /**
     * Update performance metrics
     * @param {number} optimizationTime - Time taken for optimization
     * @param {Object} metrics - Optimization metrics
     */
    updatePerformanceMetrics(optimizationTime, metrics) {
        try {
            this.metrics.batchesOptimized++;
            this.metrics.totalEmailsProcessed += metrics.originalCount;
            this.metrics.lastOptimizationTime = new Date().toISOString();
            
            // Update average optimization time
            const currentAvg = this.metrics.averageOptimizationTime;
            const count = this.metrics.batchesOptimized;
            this.metrics.averageOptimizationTime = 
                (currentAvg * (count - 1) + optimizationTime) / count;
            
            // Track distribution scores
            this.metrics.domainDistributionScores.push(metrics.distributionScore);
            
            // Keep only last 100 scores
            if (this.metrics.domainDistributionScores.length > 100) {
                this.metrics.domainDistributionScores.shift();
            }
        } catch (error) {
            this.logger.error('Error updating performance metrics', { error: error.message });
        }
    }

    /**
     * Store optimization results in database
     * @param {number} batchId - Batch ID
     * @param {Object} results - Optimization results
     */
    async storeOptimizationResults(batchId, results) {
        try {
            await knex('Bouncer_Optimization_Results').insert({
                batch_id: batchId,
                original_size: results.originalSize,
                optimized_size: results.optimizedSize,
                domain_count: results.domainCount,
                optimization_time: results.optimizationTime,
                distribution_score: results.metrics.distributionScore,
                diversity_index: results.metrics.diversityIndex,
                clustering_score: results.metrics.clusteringScore,
                efficiency: results.metrics.efficiency,
                optimization_strategy: results.strategy || 'round_robin',
                created_ts: knex.fn.now()
            });
            
            this.logger.debug('Optimization results stored', { batchId });
        } catch (error) {
            // Table might not exist, log warning but don't fail
            this.logger.warn('Could not store optimization results', { 
                error: error.message, 
                batchId 
            });
        }
    }

    /**
     * Get performance metrics
     * @returns {Object} - Performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.domainStatsCache.size,
            averageDistributionScore: this.metrics.domainDistributionScores.length > 0 
                ? this.metrics.domainDistributionScores.reduce((sum, score) => sum + score, 0) / this.metrics.domainDistributionScores.length
                : 0,
            configuration: this.optimizationConfig
        };
    }

    /**
     * Reset performance metrics
     */
    resetPerformanceMetrics() {
        this.metrics = {
            batchesOptimized: 0,
            totalEmailsProcessed: 0,
            averageOptimizationTime: 0,
            domainDistributionScores: [],
            lastOptimizationTime: null
        };
        
        this.logger.info('Performance metrics reset');
    }

    /**
     * Health check for the batch optimizer
     * @returns {Object} - Health status
     */
    async healthCheck() {
        try {
            const metrics = this.getPerformanceMetrics();
            const memoryUsage = process.memoryUsage();
            
            return {
                status: 'healthy',
                metrics,
                memoryUsage: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024)
                },
                cacheHealth: {
                    size: this.domainStatsCache.size,
                    maxSize: this.optimizationConfig.domainCacheSize,
                    utilizationPercent: (this.domainStatsCache.size / this.optimizationConfig.domainCacheSize) * 100
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export singleton instance
const batchOptimizer = new BatchOptimizer();

module.exports = batchOptimizer;