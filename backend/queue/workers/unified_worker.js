// Import all workers
const BatchCreatorWorker = require('./batch_creator_worker');
const StatusCheckerWorker = require('./status_checker_worker');
const IndividualStatusCheckerWorker = require('./individual_status_checker_worker');
const StuckBatchCleanupWorker = require('./stuck_batch_cleanup_worker');

/**
 * Unified worker that routes jobs to appropriate handlers
 */
class UnifiedWorker {
    static async processJob(job) {
        console.log(`🚦 UnifiedWorker routing job: ${job.name}`);
        
        // Route to appropriate worker based on job name
        if (job.name.startsWith('greedy_batch_creator_')) {
            console.log(`➡️  Routing to BatchCreatorWorker`);
            const worker = new BatchCreatorWorker();
            return await worker.processJob(job);
        }
        
        if (job.name.startsWith('status_checker_')) {
            console.log(`➡️  Routing to StatusCheckerWorker`);
            const worker = new StatusCheckerWorker();
            return await worker.processJob(job);
        }
        
        if (job.name.startsWith('individual_status_check_')) {
            console.log(`➡️  Routing to IndividualStatusCheckerWorker`);
            const worker = new IndividualStatusCheckerWorker();
            return await worker.processJob(job);
        }
        
        if (job.name === 'stuck_batch_cleanup') {
            console.log(`➡️  Routing to StuckBatchCleanupWorker`);
            const worker = new StuckBatchCleanupWorker();
            return await worker.processJob(job);
        }
        
        console.log(`❓ Unknown job type: ${job.name}`);
        return;
    }
}

module.exports = UnifiedWorker;