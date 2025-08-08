// API Imports
const BouncerAPI = require('../../external_apis/bouncer');

// Function Imports
const {
    db_markBouncerBatchFailed,
    db_processBouncerResults,
    db_updateBouncerBatchProcessed,
    db_checkRateLimit,
    db_recordRateLimit
} = require('../funs_db.js');

// Individual Status Checker Worker
class IndividualStatusCheckerWorker {
    constructor() {
        this.bouncerAPI = new BouncerAPI();
        this.queueManager = require('../queue_manager');
    }

    /**
     * Process individual batch status check with fixed intervals
     */
    async processJob(job) {
        const { bouncer_batch_id, check_type, attempt = 1, max_attempts = 4320 } = job.data;
        
        try {
            console.log(`🔍 Status check attempt ${attempt}/${max_attempts} for ${check_type} batch: ${bouncer_batch_id}`);

            // Rate limit check before API call
            const [rateLimitSuccess, canMakeRequest] = await db_checkRateLimit(check_type, 'check_status');
            if (!rateLimitSuccess || !canMakeRequest) {
                console.log(`⏳ Rate limit reached for ${check_type}, rescheduling batch ${bouncer_batch_id}`);
                await this.rescheduleStatusCheck(bouncer_batch_id, check_type, attempt, max_attempts, 5000); // Retry in 5s
                return;
            }

            // Check batch status
            let isCompleted = false;
            let processedCount = 0;
            try {
                let statusResult;
                if (check_type === 'deliverable') statusResult = await this.bouncerAPI.checkDeliverabilityBatch(bouncer_batch_id);
                else if (check_type === 'catchall') statusResult = await this.bouncerAPI.checkCatchallBatch(bouncer_batch_id);
                else throw new Error(`Invalid check_type: ${check_type}`);

                // Record rate limit usage
                await db_recordRateLimit(check_type, 'check_status');

                // Parse status result
                isCompleted = statusResult.isCompleted;
                processedCount = statusResult.processed;

                if (!isCompleted) {
                    // Batch still processing - schedule next check with fixed interval (let rate limiter handle throttling)
                    if (attempt < max_attempts) {
                        const nextDelay = 5000; // Fixed 5 second interval - rate limiter will handle throttling
                        console.log(`⏳ Batch ${bouncer_batch_id} still processing, checking again in ${nextDelay/1000}s`);
                        await this.rescheduleStatusCheck(bouncer_batch_id, check_type, attempt + 1, max_attempts, nextDelay);
                    } else {
                        console.log(`⚠️ Max attempts reached for batch ${bouncer_batch_id}, marking as failed`);
                        await db_markBouncerBatchFailed(bouncer_batch_id, check_type);
                    }
                    return;
                }

                // Update processed count in DB for batches
                await db_updateBouncerBatchProcessed(check_type, bouncer_batch_id, processedCount);

                // Batch completed - download results immediately
                console.log(`✅ Batch ${bouncer_batch_id} completed, downloading results`);
                await this.downloadAndProcessResults(bouncer_batch_id, check_type);

            } catch (error) {
                console.error(`❌ Failed to check status for batch ${bouncer_batch_id}:`, error.message);
                
                // Mark batch as failed
                const [markFailedSuccess] = await db_markBouncerBatchFailed(bouncer_batch_id, check_type);
                if (markFailedSuccess) console.log(`💀 Marked batch ${bouncer_batch_id} as failed`);
            }

        } catch (error) {
            console.error(`💥 Fatal error in individual status check for batch ${bouncer_batch_id}:`, error);
            throw error;
        }
    }

    /**
     * Reschedule status check with fixed interval
     */
    async rescheduleStatusCheck(bouncerBatchId, check_type, attempt, max_attempts, delayMs) {
        try {
            await this.queueManager.queue.add(`individual_status_check_${check_type}`, 
                { 
                    bouncer_batch_id: bouncerBatchId,
                    check_type: check_type,
                    attempt: attempt,
                    max_attempts: max_attempts
                }, 
                {
                    delay: delayMs,
                    attempts: 1,
                    removeOnComplete: 5,
                    removeOnFail: 5
                }
            );
        } catch (error) {
            console.error(`❌ Failed to reschedule status check for batch ${bouncerBatchId}:`, error.message);
        }
    }

    /**
     * Download and process results immediately
     */
    async downloadAndProcessResults(bouncerBatchId, check_type) {
        try {
            console.log(`📥 Downloading results for ${check_type} batch: ${bouncerBatchId}`);

            // Rate limit check before download
            const [rateLimitSuccess, canMakeRequest] = await db_checkRateLimit(check_type, 'download_results');
            if (!rateLimitSuccess || !canMakeRequest) {
                console.log(`⏳ Rate limit reached for ${check_type}, skipping download for ${bouncerBatchId}`);
                // Could reschedule download, but for now we'll skip
                return;
            }

            // Download results via Bouncer API
            let results;
            if (check_type === 'deliverable') results = await this.bouncerAPI.getDeliverabilityResults(bouncerBatchId);
            else if (check_type === 'catchall') results = await this.bouncerAPI.getCatchallResults(bouncerBatchId);
            else throw new Error(`Invalid check_type: ${check_type}`);

            // Record rate limit usage
            await db_recordRateLimit(check_type, 'download_results');

            // Process results immediately
            console.log(`📊 Downloaded ${results.length} results for batch ${bouncerBatchId}`);
            const [processSuccess, processedCount] = await db_processBouncerResults(
                bouncerBatchId, 
                results, 
                check_type
            );

            // Log status
            if (processSuccess) console.log(`✅ Processed ${processedCount} results for batch ${bouncerBatchId}`);
            else console.error(`❌ Failed to process results for batch ${bouncerBatchId}`);

        } catch (error) {
            console.error(`💥 Error downloading/processing results for ${bouncerBatchId}:`, error.message);
            
            // Mark batch as failed if result processing fails
            const [markFailedSuccess] = await db_markBouncerBatchFailed(bouncerBatchId, check_type);
            if (markFailedSuccess) console.log(`💀 Marked batch ${bouncerBatchId} as failed due to result processing error`);
        }
    }

    /**
     * Handle job filtering - only process individual status check jobs
     */
    static async processJob(job) {
        // Skip other job types
        if (!job.name.startsWith('individual_status_check_')) return;

        // Process job
        const worker = new IndividualStatusCheckerWorker();
        return await worker.processJob(job);
    }
}

module.exports = IndividualStatusCheckerWorker;