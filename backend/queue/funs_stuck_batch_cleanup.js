// Dependencies
const knex = require('knex')(require('../knexfile.js').development);

// Util Imports
const {
    getBatchTableName,
    getEmailBatchAssociationTableName
} = require('../routes/batches/funs_db_utils.js');

/**
 * Clean up stuck and complete batches
 * A batch is considered "stuck and complete" when:
 * - All emails are complete (no records with is_complete = 0)
 * - But the batch status is still "processing"
 * 
 * @param {string} check_type - 'deliverable' or 'catchall'
 * @returns {Promise<[boolean, number]>} - [success, cleaned_count]
 */
async function cleanupStuckBatches(check_type) {
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
                    // Mark batch as completed
                    await knex(batch_table)
                        .where('id', batch.id)
                        .update({
                            status: 'completed',
                            completed_ts: knex.fn.now()
                        });
                    
                    console.log(`🧹 Cleaned up stuck batch ${batch.id} (${check_type}) - marked as completed`);
                    cleaned_count++;
                    
                    // Import notification functions only if needed
                    const { resend_sendBatchCompletionEmail } = require('../external_apis/resend.js');
                    const { s3_triggerS3Enrichment } = require('../routes/batches/funs_s3');
                    const db_s3_funcs = require('../routes/batches/funs_db_s3');
                    
                    // Send completion email
                    try {
                        // Get batch details
                        const batch_details = await knex(batch_table)
                            .where('id', batch.id)
                            .select('title', 'user_id')
                            .first();
                        
                        if (batch_details) {
                            // Get user email
                            const user = await knex('Users')
                                .where('id', batch_details.user_id)
                                .select('email')
                                .first();
                            
                            if (user) {
                                const email_result = await resend_sendBatchCompletionEmail(
                                    user.email,
                                    batch_details.title || 'Untitled Batch',
                                    check_type,
                                    batch.id
                                );
                                
                                if (!email_result.error) {
                                    console.log(`📧 Batch completion email sent for cleaned batch ${batch.id}`);
                                }
                            }
                        }
                    } catch (email_error) {
                        console.log(`⚠️ Error sending batch completion email for cleaned batch ${batch.id}:`, email_error.message);
                    }
                    
                    // Trigger S3 enrichment
                    try {
                        s3_triggerS3Enrichment(batch.id, check_type, db_s3_funcs)
                            .then(() => {
                                console.log(`✅ S3 enrichment completed for cleaned batch ${batch.id}`);
                            })
                            .catch((error) => {
                                console.error(`❌ S3 enrichment failed for cleaned batch ${batch.id}:`, error.message);
                            });
                        
                        console.log(`🚀 S3 enrichment triggered for cleaned batch ${batch.id}`);
                    } catch (enrichment_error) {
                        console.error(`⚠️ Error triggering S3 enrichment for cleaned batch ${batch.id}:`, enrichment_error.message);
                    }
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
async function cleanupAllStuckBatches() {
    console.log('🔍 Checking for stuck batches...');
    
    const [deliverable_success, deliverable_count] = await cleanupStuckBatches('deliverable');
    const [catchall_success, catchall_count] = await cleanupStuckBatches('catchall');
    
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
    cleanupStuckBatches,
    cleanupAllStuckBatches
};