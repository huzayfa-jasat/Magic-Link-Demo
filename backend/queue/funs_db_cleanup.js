// Dependencies
const knex = require('knex')(require('../knexfile.js').development);

// Function Imports
const { checkAndCompleteUserBatch } = require('./funs_db.js');
const {
    getBatchTableName,
    getEmailBatchAssociationTableName
} = require('../routes/batches/funs_db_utils.js');

/**
 * Clean up stuck and complete batches
 * A batch is considered "stuck and complete" when:
 * - All emails are complete (no records with did_complete = 0)
 * - But the batch status is still "processing"
 * 
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {Promise<[boolean, number]>} - [success, cleaned_count]
 */
async function db_cleanupStuckBatches(check_type) {
    const batch_table = getBatchTableName(check_type);
    const batch_email_table = getEmailBatchAssociationTableName(check_type);
    
    if (!batch_table || !batch_email_table) {
        console.error(`Invalid check_type: ${check_type}`);
        return [false, 0];
    }
    
    try {
        // Find all batches that are stuck in "processing" status
        const stuck_batches = await knex(batch_table)
            .select('id')
            .where('status', 'processing')
            .where('is_archived', 0);
        
        if (stuck_batches.length === 0) {
            return [true, 0];
        }
        
        let cleaned_count = 0;
        
        // Check each potentially stuck batch
        for (const batch of stuck_batches) {
            // Check if there are any incomplete emails for this batch
            const incomplete_emails = await knex(batch_email_table)
                .where('batch_id', batch.id)
                .where('did_complete', 0)
                .count('* as count')
                .first();
            
            // If no incomplete emails, this batch is stuck and should be marked complete
            if (incomplete_emails.count === 0) {
                // Check if batch has any emails at all (to avoid marking empty batches as complete)
                const total_emails = await knex(batch_email_table)
                    .where('batch_id', batch.id)
                    .count('* as count')
                    .first();
                
                if (total_emails.count > 0) {
                    // Use the existing checkAndCompleteUserBatch function
                    // This handles marking as complete, sending email, and triggering S3 enrichment
                    await checkAndCompleteUserBatch(null, batch.id, check_type);
                    
                    console.log(`🧹 Cleaned up stuck batch ${batch.id} (${check_type})`);
                    cleaned_count++;
                }
            }
        }
        
        if (cleaned_count > 0) {
            console.log(`✅ Cleaned up ${cleaned_count} stuck ${check_type} batches`);
        }
        
        return [true, cleaned_count];
        
    } catch (error) {
        console.error(`Error cleaning up stuck ${check_type} batches:`, error);
        return [false, 0];
    }
}

/**
 * Clean up stuck batches for both deliverable and catchall types
 * @returns {Promise<[boolean, object]>} - [success, {deliverable_count, catchall_count}]
 */
async function db_cleanupAllStuckBatches() {
    console.log('🔍 Checking for stuck batches...');
    
    const [deliverable_success, deliverable_count] = await db_cleanupStuckBatches('deliverable');
    const [catchall_success, catchall_count] = await db_cleanupStuckBatches('catchall');
    
    const total_cleaned = deliverable_count + catchall_count;
    
    if (total_cleaned > 0) {
        console.log(`🎉 Total stuck batches cleaned: ${total_cleaned} (deliverable: ${deliverable_count}, catchall: ${catchall_count})`);
    }
    
    return [
        deliverable_success && catchall_success,
        {
            deliverable_count,
            catchall_count,
            total: total_cleaned
        }
    ];
}

// Exports
module.exports = {
    db_cleanupStuckBatches,
    db_cleanupAllStuckBatches
};