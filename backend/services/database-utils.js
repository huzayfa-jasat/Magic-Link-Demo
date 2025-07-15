const knex = require('knex');
const config = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

class DatabaseUtils {
    
    async getBatchInfo(batchId) {
        return await db('Bouncer_Batches')
            .where('id', batchId)
            .first();
    }
    
    async updateBatchStatus(batchId, status, errorMessage = null) {
        const updateData = {
            status,
            updated_ts: new Date()
        };
        
        if (status === 'completed') {
            updateData.completed_ts = new Date();
        }
        
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }
        
        return await db('Bouncer_Batches')
            .where('id', batchId)
            .update(updateData);
    }
    
    async updateContactResult(trx, result) {
        // Update the main contact record with verification results
        await trx('Contacts_Global')
            .where('global_id', result.global_id)
            .update({
                bouncer_status: result.bouncer_status,
                bouncer_reason: result.bouncer_reason,
                bouncer_score: result.score,
                bouncer_toxic: result.toxic,
                bouncer_toxicity: result.toxicity,
                updated_ts: new Date()
            });
    }
    
    async storeDetailedResults(trx, batchId, results) {
        const detailedResults = results.map(result => ({
            batch_id: batchId,
            global_id: result.global_id,
            bouncer_status: result.bouncer_status,
            bouncer_reason: result.bouncer_reason,
            domain_info: JSON.stringify(result.domain_info || {}),
            account_info: JSON.stringify(result.account_info || {}),
            dns_info: JSON.stringify(result.dns_info || {}),
            provider: result.provider,
            score: result.score,
            toxic: result.toxic,
            toxicity: result.toxicity,
            processed_ts: new Date()
        }));
        
        // Insert in batches to avoid overwhelming the database
        const batchSize = 1000;
        for (let i = 0; i < detailedResults.length; i += batchSize) {
            const batch = detailedResults.slice(i, i + batchSize);
            await trx('Bouncer_Results').insert(batch);
        }
    }
    
    async updateQueueItems(trx, batchId, status) {
        await trx('Bouncer_Queue')
            .where('batch_id', batchId)
            .update({
                status,
                completed_ts: status === 'completed' ? new Date() : null
            });
    }
    
    async getQueuedEmails(limit = 10000, userId = null, requestId = null) {
        let query = db('Bouncer_Queue')
            .join('Contacts_Global', 'Bouncer_Queue.global_id', 'Contacts_Global.global_id')
            .where('Bouncer_Queue.status', 'queued')
            .orderBy('Bouncer_Queue.priority', 'desc')
            .orderBy('Bouncer_Queue.created_ts', 'asc')
            .limit(limit)
            .select(
                'Bouncer_Queue.queue_id',
                'Bouncer_Queue.global_id',
                'Bouncer_Queue.user_id',
                'Bouncer_Queue.request_id',
                'Contacts_Global.email',
                'Contacts_Global.first_name',
                'Contacts_Global.last_name'
            );
        
        if (userId) {
            query = query.where('Bouncer_Queue.user_id', userId);
        }
        
        if (requestId) {
            query = query.where('Bouncer_Queue.request_id', requestId);
        }
        
        return await query;
    }
    
    async assignEmailsToBatch(emailIds, batchId) {
        await db('Bouncer_Queue')
            .whereIn('queue_id', emailIds)
            .update({
                batch_id: batchId,
                status: 'assigned',
                assigned_ts: new Date()
            });
    }
    
    async storeHealthMetrics(metrics) {
        const metricsToStore = [
            { metric_name: 'redis_connected', metric_value: metrics.redis ? 1 : 0 },
            { metric_name: 'database_connected', metric_value: metrics.database ? 1 : 0 },
            { metric_name: 'bouncer_api_available', metric_value: metrics.bouncer_api ? 1 : 0 },
            { metric_name: 'queue_waiting_jobs', metric_value: metrics.queue_stats.waiting || 0 },
            { metric_name: 'queue_active_jobs', metric_value: metrics.queue_stats.active || 0 },
            { metric_name: 'queue_failed_jobs', metric_value: metrics.queue_stats.failed || 0 },
            { metric_name: 'rate_limit_remaining', metric_value: metrics.rate_limit_status.remaining || 0 }
        ];
        
        await db('Bouncer_Health_Metrics').insert(metricsToStore);
    }
    
    async cleanupOldHealthMetrics() {
        // Keep only the last 24 hours of health metrics
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        await db('Bouncer_Health_Metrics')
            .where('recorded_ts', '<', yesterday)
            .del();
    }
    
    async getRecentHealthMetrics(hours = 1) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        return await db('Bouncer_Health_Metrics')
            .where('recorded_ts', '>=', since)
            .orderBy('recorded_ts', 'desc');
    }
    
    // Transaction helper
    async transaction(callback) {
        return await db.transaction(callback);
    }
}

module.exports = new DatabaseUtils();