// API Imports
const BouncerAPI = require('../../external_apis/bouncer');

// Function Imports
const {
    db_getOutstandingBouncerBatches,
    db_markBouncerBatchFailed,
    db_processBouncerResults,
    db_checkRateLimit,
    db_recordRateLimit,
    db_updateBouncerBatchProcessed
} = require('../funs_db.js');

// Status Checker Worker
class StatusCheckerWorker {
    constructor() {
        this.bouncerAPI = new BouncerAPI();
    }

    /**
     * Main job processing function for status checking and result downloading
     * Implements fire-and-forget approach
     */
    async processJob(job) {
        const { check_type } = job.data;
        
        try {
            console.log(`🔍 Starting status check for ${check_type} batches`);

            // 1. Get all outstanding bouncer batches
            const [batchesSuccess, bouncerBatchIds] = await db_getOutstandingBouncerBatches(check_type);
            if (!batchesSuccess) {
                console.log(`❌ Failed to get outstanding batches for ${check_type}`);
                return;
            }

            if (!bouncerBatchIds || bouncerBatchIds.length === 0) {
                console.log(`✅ No outstanding batches for ${check_type}`);
                return;
            }

            console.log(`📊 Found ${bouncerBatchIds.length} outstanding ${check_type} batches to check`);

            // 2. Process each bouncer batch
            for (const bouncerBatchId of bouncerBatchIds) {
                try {
                    await this.processSingleBatch(bouncerBatchId, check_type);
                } catch (error) {
                    console.error(`❌ Error processing batch ${bouncerBatchId}:`, error.message);
                    // Continue with next batch - individual failures shouldn't stop the process
                    continue;
                }
            }

            console.log(`🎉 Completed status check cycle for ${check_type}`);

        } catch (error) {
            console.error(`💥 Fatal error in status checking for ${check_type}:`, error);
            throw error; // Re-throw to mark job as failed
        }
    }

    /**
     * Process a single bouncer batch - check status and handle results
     */
    async processSingleBatch(bouncerBatchId, check_type) {
        console.log(`🔍 Checking status for ${check_type} batch: ${bouncerBatchId}`);

        // Rate limit check before API call
        const [rateLimitSuccess, canMakeRequest] = await db_checkRateLimit(check_type, 'check_status');
        if (!rateLimitSuccess || !canMakeRequest) {
            console.log(`⏳ Rate limit reached for ${check_type}, skipping batch ${bouncerBatchId}`);
            return;
        }

        // Check batch status (& download results if completed)
        let isCompleted = false;
        let processedCount = 0;
        try {
            let statusResult;
            if (check_type === 'deliverable') {
                statusResult = await this.bouncerAPI.checkDeliverabilityBatch(bouncerBatchId);
                // isCompleted = statusResult.isCompleted;
                // processedCount = statusResult.processed;
            } else if (check_type === 'catchall') {
                // isCompleted = await this.bouncerAPI.checkCatchallBatch(bouncerBatchId);
                statusResult = await this.bouncerAPI.checkDeliverabilityBatch(bouncerBatchId);
            } else throw new Error(`Invalid check_type: ${check_type}`);
            
            // Parse status result`
            isCompleted = statusResult.isCompleted;
            processedCount = statusResult.processed;

            // Record rate limit usage
            await db_recordRateLimit(check_type, 'check_status');

            // Update processed count in DB for batches
            await db_updateBouncerBatchProcessed(check_type, bouncerBatchId, processedCount);

            // Log status
            if (!isCompleted) {
                console.log(`⏳ Batch ${bouncerBatchId} still processing (${processedCount} processed)`);
                return;
            } else console.log(`✅ Batch ${bouncerBatchId} is completed, downloading results immediately`);

            // Download results
            await this.downloadAndProcessResults(bouncerBatchId, check_type);

        } catch (error) {
            console.error(`❌ Failed to check status for batch ${bouncerBatchId}:`, error.message);
            
            // Mark batch as failed if API call fails
            const [markFailedSuccess] = await db_markBouncerBatchFailed(bouncerBatchId, check_type);
            if (markFailedSuccess) console.log(`💀 Marked batch ${bouncerBatchId} as failed`);
        }
    }

    /**
     * Download and process results immediately (fire-and-forget)
     */
    async downloadAndProcessResults(bouncerBatchId, check_type) {
        try {
            console.log(`📥 Downloading results for ${check_type} batch: ${bouncerBatchId}`);

            // Rate limit check before download
            const [rateLimitSuccess, canMakeRequest] = await db_checkRateLimit(check_type, 'download_results');
            if (!rateLimitSuccess || !canMakeRequest) {
                console.log(`⏳ Rate limit reached for ${check_type}, skipping download for ${bouncerBatchId}`);
                return;
            }

            // Download results via Bouncer API
            let results;
            if (check_type === 'deliverable') results = await this.bouncerAPI.getDeliverabilityResults(bouncerBatchId);
            else if (check_type === 'catchall') results = await this.bouncerAPI.getCatchallResults(bouncerBatchId);
            else throw new Error(`Invalid check_type: ${check_type}`);

            // Record rate limit usage
            await db_recordRateLimit(check_type, 'download_results');

            // Process results immediately (fire-and-forget)
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
     * Handle job filtering - only process status_checker jobs
     */
    static async processJob(job) {
        console.log(`📋 StatusCheckerWorker received job: ${job.name} with data:`, job.data);
        
        // Skip other job types
        if (!job.name.startsWith('status_checker_')) {
            console.log(`⏭️  Skipping non-status-checker job: ${job.name}`);
            return;
        }

        // Process job
        const worker = new StatusCheckerWorker();
        return await worker.processJob(job);
    }
}

module.exports = StatusCheckerWorker;