// Import cleanup functions
const { cleanupAllStuckBatches } = require('../funs_stuck_batch_cleanup');

/**
 * Worker for cleaning up stuck batches
 * Runs periodically to find and complete batches that are stuck in "processing" status
 * but have all their emails completed
 */
class StuckBatchCleanupWorker {
    constructor() {
        this.workerName = 'StuckBatchCleanupWorker';
    }

    /**
     * Process job - Clean up stuck batches
     * @param {Object} job - BullMQ job object
     */
    async processJob(job) {
        console.log(`🧹 ${this.workerName} starting stuck batch cleanup...`);
        const start_time = Date.now();
        
        try {
            // Clean up stuck batches for both deliverable and catchall
            const [success, results] = await cleanupAllStuckBatches();
            
            if (!success) {
                throw new Error('Failed to clean up stuck batches');
            }
            
            const duration = Date.now() - start_time;
            
            // Log results
            if (results.total > 0) {
                console.log(`✅ ${this.workerName} completed - cleaned ${results.total} stuck batches in ${duration}ms`);
            } else {
                console.log(`✅ ${this.workerName} completed - no stuck batches found (${duration}ms)`);
            }
            
            return {
                success: true,
                cleaned: results,
                duration: duration
            };
            
        } catch (error) {
            const duration = Date.now() - start_time;
            console.error(`❌ ${this.workerName} failed after ${duration}ms:`, error.message);
            
            // Throw error to mark job as failed in BullMQ
            throw error;
        }
    }
}

module.exports = StuckBatchCleanupWorker;