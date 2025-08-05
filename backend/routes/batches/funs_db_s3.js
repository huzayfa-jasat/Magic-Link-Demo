// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);

// Function Imports
const {
    getBatchTableName,
    getResultsTableName,
    getEmailBatchAssociationTableName
} = require('./funs_db_utils.js');

/**
 * Get batch with S3 metadata
 */
async function db_s3_getBatchWithS3Metadata(batchId, checkType) {
    const tableName = getBatchTableName(checkType);
    const batch = await knex(tableName)
        .where('id', batchId)
        .first();
    
    if (batch && batch.s3_metadata) {
        // Parse JSON if it's a string
        if (typeof batch.s3_metadata === 'string') {
            batch.s3_metadata = JSON.parse(batch.s3_metadata);
        }
    }
    
    return batch;
}

/**
 * Get all batch results for enrichment
 */
async function db_s3_getAllBatchResults(batchId, checkType) {
    const resultsTable = getResultsTableName(checkType);
    const batchEmailTable = getEmailBatchAssociationTableName(checkType);
    
    const query = knex(resultsTable)
        .join('Emails_Global', 'Emails_Global.global_id', `${resultsTable}.email_global_id`)
        .join(batchEmailTable, `${batchEmailTable}.email_global_id`, `${resultsTable}.email_global_id`)
        .where(`${batchEmailTable}.batch_id`, batchId);
    
    if (checkType === 'deliverable') {
        return await query.select(
            'Emails_Global.email_stripped',
            `${resultsTable}.status`,
            `${resultsTable}.reason`,
            `${resultsTable}.is_catchall`,
            `${resultsTable}.score`,
            `${resultsTable}.provider`
        );
    } else if (checkType === 'catchall') {
        return await query.select(
            'Emails_Global.email_stripped',
            `${resultsTable}.status`,
            `${resultsTable}.reason`,
            `${resultsTable}.score`,
            `${resultsTable}.toxicity`
        );
    }
}

/**
 * Update batch metadata with S3 info
 */
async function db_s3_updateBatchS3Metadata(batchId, checkType, s3Key, fileInfo) {
    let err_code;

    // Get table name
    const batch_table = getBatchTableName(checkType);
    if (!batch_table) return false;
    
    // Update batch metadata
    const metadata = {
        original: {
            s3_key: s3Key,
            upload_timestamp: new Date().toISOString(),
            file_size: fileInfo.fileSize,
            mime_type: fileInfo.mimeType,
            file_name: fileInfo.fileName,
            column_mapping: fileInfo.columnMapping || { email: 0 }
        },
        exports: {}
    };
    await knex(batch_table).where('id', batchId).update({ 
        s3_metadata: JSON.stringify(metadata)
    }).catch((err)=>{if (err) err_code = err.code});
    if (err_code) return false;
    
    // Return
    return true;
}

/**
 * Update batch export metadata
 */
async function db_s3_updateBatchExportMetadata(batchId, checkType, exports) {
    const tableName = getBatchTableName(checkType);
    
    // Get current metadata
    const batch = await db_s3_getBatchWithS3Metadata(batchId, checkType);
    if (!batch || !batch.s3_metadata) {
        throw new Error('Batch metadata not found');
    }
    
    // Update exports section
    const updatedMetadata = {
        ...batch.s3_metadata,
        exports: {
            ...batch.s3_metadata.exports,
            ...exports
        }
    };
    
    return await knex(tableName)
        .where('id', batchId)
        .update({ 
            s3_metadata: JSON.stringify(updatedMetadata)
        });
}

/**
 * Create enrichment progress entry
 */
async function db_s3_createEnrichmentProgress(batchId, checkType) {
    return await knex('S3_Enrichment_Progress')
        .insert({
            batch_id: batchId,
            check_type: checkType,
            status: 'processing',
            rows_processed: 0,
            started_at: knex.fn.now()
        })
        .onConflict(['batch_id', 'check_type'])
        .merge({
            status: 'processing',
            rows_processed: 0,
            started_at: knex.fn.now(),
            completed_at: null,
            error_message: null,
            updated_at: knex.fn.now()
        });
}

/**
 * Update enrichment progress
 */
async function db_s3_updateEnrichmentProgress(batchId, checkType, rowsProcessed) {
    return await knex('S3_Enrichment_Progress')
        .where({ batch_id: batchId, check_type: checkType })
        .update({
            rows_processed: rowsProcessed,
            updated_at: knex.fn.now()
        });
}

/**
 * Complete enrichment progress
 */
async function db_s3_completeEnrichmentProgress(batchId, checkType, totalRows) {
    return await knex('S3_Enrichment_Progress')
        .where({ batch_id: batchId, check_type: checkType })
        .update({
            status: 'completed',
            rows_processed: totalRows,
            total_rows: totalRows,
            completed_at: knex.fn.now(),
            updated_at: knex.fn.now()
        });
}

/**
 * Fail enrichment progress
 */
async function db_s3_failEnrichmentProgress(batchId, checkType, errorMessage) {
    return await knex('S3_Enrichment_Progress')
        .where({ batch_id: batchId, check_type: checkType })
        .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: knex.fn.now()
        });
}

/**
 * Get enrichment progress
 */
async function db_s3_getEnrichmentProgress(batchId, checkType) {
    return await knex('S3_Enrichment_Progress')
        .where({ batch_id: batchId, check_type: checkType })
        .first();
}

/**
 * Check if user has access to batch
 */
async function db_s3_checkUserBatchAccess(userId, batchId, checkType) {
    const tableName = getBatchTableName(checkType);
    const batch = await knex(tableName)
        .where({ id: batchId, user_id: userId })
        .first();
    
    return [!!batch, batch];
}

module.exports = {
    db_s3_getBatchWithS3Metadata,
    db_s3_getAllBatchResults,
    db_s3_updateBatchS3Metadata,
    db_s3_updateBatchExportMetadata,
    db_s3_createEnrichmentProgress,
    db_s3_updateEnrichmentProgress,
    db_s3_completeEnrichmentProgress,
    db_s3_failEnrichmentProgress,
    db_s3_getEnrichmentProgress,
    db_s3_checkUserBatchAccess
};