// API Imports
const BouncerAPI = require('../../external_apis/bouncer');

// Function Imports
const {
    db_getOutstandingBouncerBatchCount,
    db_getEmailsForGreedyBatch,
    db_assignBouncerBatchId,
    db_checkRateLimit,
    db_recordRateLimit
} = require('../funs_db.js');

// Batch Creator Worker
class BatchCreatorWorker {
    constructor() {
        this.bouncerAPI = new BouncerAPI();
        this.queueManager = require('../queue_manager');
    }

    /**
     * Main job processing function for batch creation
     * Implements multi-batch greedy approach
     */
    async processJob(job) {
        const { check_type } = job.data;
        
        try {
            console.log(`🚀 Starting greedy batch creation for ${check_type}`);

            // 1. Check Available Capacity (max 15 concurrent batches)
            const [capacitySuccess, currentCount, availableCapacity] = await db_getOutstandingBouncerBatchCount(check_type);
            if (!capacitySuccess) {
                console.log(`❌ Failed to check capacity for ${check_type}`);
                return;
            }

            if (availableCapacity === 0) {
                console.log(`⏸️ No available capacity for ${check_type} (${currentCount}/15 batches active)`);
                return;
            }

            console.log(`📊 Available capacity: ${availableCapacity} batches for ${check_type} (current: ${currentCount}/15)`);

            // 2. Initial Rate Limit Check
            const [rateLimitSuccess, canMakeRequest] = await db_checkRateLimit(check_type, 'create_batch');
            if (!rateLimitSuccess || !canMakeRequest) {
                console.log(`⏳ Rate limit reached for ${check_type}, skipping batch creation cycle`);
                return;
            }

            // 3. Create Multiple Batches Loop (Multi-batch greedy approach)
            let batchesCreated = 0;
            
            for (let i = 0; i < availableCapacity; i++) {
                try {
                    console.log(`📦 Creating batch ${i + 1}/${availableCapacity} for ${check_type}`);

                    // Get 10k emails for this batch (FIFO ordered)
                    const [emailsSuccess, emailsData] = await db_getEmailsForGreedyBatch(check_type, 10000);
                    if (!emailsSuccess) {
                        console.log(`❌ Failed to get emails for ${check_type} batch ${i + 1}`);
                        break;
                    }

                    if (!emailsData || emailsData.length === 0) {
                        console.log(`✅ No more pending emails for ${check_type}, stopping batch creation (checked ${i} batches)`);
                        break;
                    }

                    console.log(`📧 Retrieved ${emailsData.length} emails for ${check_type} batch ${i + 1}`);

                    // Prepare email list for bouncer API (stripped emails)
                    const emailList = emailsData.map(email => email.email_stripped);

                    // Create bouncer batch via API
                    let bouncerBatchId;
                    if (check_type === 'deliverable') bouncerBatchId = await this.bouncerAPI.createDeliverabilityBatch(emailList);
                    else if (check_type === 'catchall') bouncerBatchId = await this.bouncerAPI.createCatchallBatch(emailList);
                    else throw new Error(`Invalid check_type: ${check_type}`);
                    
                    console.log(`🎯 Created bouncer batch ${bouncerBatchId} for ${check_type}`);

                    // Prepare batch assignments for database update
                    const batchAssignments = this.prepareBatchAssignments(emailsData, bouncerBatchId);

                    // Update database with batch assignment
                    const [assignSuccess, affectedBatches] = await db_assignBouncerBatchId(
                        bouncerBatchId, 
                        batchAssignments, 
                        check_type
                    );

                    if (!assignSuccess) {
                        console.log(`❌ Failed to assign bouncer batch ID ${bouncerBatchId} for ${check_type}`);
                        // Continue with next batch - this batch will be retried next cycle
                        continue;
                    }

                    // console.log(`✅ Assigned ${affectedBatches} user batches to bouncer batch ${bouncerBatchId}`);

                    // Schedule individual status check for this specific batch (5 seconds delay)
                    await this.scheduleStatusCheck(bouncerBatchId, check_type, 5000);

                    // Record rate limit usage
                    await db_recordRateLimit(check_type, 'create_batch');
                    batchesCreated++;

                    // Rate limit check before next iteration
                    const [nextRateLimitSuccess, canContinue] = await db_checkRateLimit(check_type, 'create_batch');
                    if (!nextRateLimitSuccess || !canContinue) {
                        console.log(`⏳ Approaching rate limit for ${check_type}, stopping batch creation`);
                        break;
                    }

                } catch (error) {
                    console.error(`❌ Error creating batch ${i + 1} for ${check_type}:`, error.message);
                    // Continue with next batch - individual failures shouldn't stop the process
                    continue;
                }
            }

            console.log(`🎉 Completed batch creation cycle for ${check_type}: ${batchesCreated} batches created`);

        } catch (error) {
            console.error(`💥 Fatal error in batch creation for ${check_type}:`, error);
            throw error; // Re-throw to mark job as failed
        }
    }

    /**
     * Schedule individual status check for a specific bouncer batch
     */
    async scheduleStatusCheck(bouncerBatchId, check_type, delayMs) {
        try {
            await this.queueManager.queue.add(`individual_status_check_${check_type}`, 
                { 
                    bouncer_batch_id: bouncerBatchId,
                    check_type: check_type,
                    attempt: 1,
                    max_attempts: 4320 // Will check up to 4320 times (6 hours) with 5s intervals
                }, 
                {
                    delay: delayMs,
                    attempts: 1, // No job-level retries, we handle fixed-interval retries internally
                    removeOnComplete: 5,
                    removeOnFail: 5
                }
            );
            console.log(`📅 Scheduled status check for ${check_type} batch ${bouncerBatchId} in ${delayMs/1000}s`);
        } catch (error) {
            console.error(`❌ Failed to schedule status check for batch ${bouncerBatchId}:`, error.message);
        }
    }

    /**
     * Prepare batch assignments for database update
     * Groups emails by user_batch_id and tracks which emails belong to each
     */
    prepareBatchAssignments(emailsData, bouncerBatchId) {
        const userBatchMap = new Map();

        // Group emails by user_batch_id
        emailsData.forEach(email => {
            const { user_batch_id, email_global_id } = email;
            
            if (!userBatchMap.has(user_batch_id)) {
                userBatchMap.set(user_batch_id, {
                    user_batch_id,
                    email_global_ids: [],
                    is_partial: false // Will be determined by database function
                });
            }
            
            userBatchMap.get(user_batch_id).email_global_ids.push(email_global_id);
        });

        // Convert to array format expected by database function
        return Array.from(userBatchMap.values());
    }

    /**
     * Handle job filtering - only process greedy_batch_creator jobs
     */
    static async processJob(job) {
        // Skip other job types
        if (!job.name.startsWith('greedy_batch_creator_')) return;

        // Process job
        const worker = new BatchCreatorWorker();
        return await worker.processJob(job);
    }
}

module.exports = BatchCreatorWorker;