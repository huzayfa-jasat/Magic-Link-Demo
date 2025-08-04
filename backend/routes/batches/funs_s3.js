// Dependencies
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PassThrough, Transform } = require("stream");
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const XLSX = require('xlsx');

// Util Imports
const { stripEmailModifiers } = require('../../utils/processEmails');

// Initialize S3 client
const s3Client = new S3Client({ 
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const S3_BUCKET = process.env.S3_BUCKET;

// In-progress enrichment tracking
const enrichmentInProgress = new Map();

/**
 * Generate a pre-signed URL for S3 upload
 */
async function s3_generateUploadUrl(fileName, fileSize, mimeType, batchId, checkType) {
    const timestamp = Date.now();
    const s3Key = `uploads/${checkType}/${batchId}/original-${timestamp}-${fileName}`;
    
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: mimeType,
        ContentLength: fileSize
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    
    return { uploadUrl, s3Key };
}

/**
 * Generate pre-signed URLs for export downloads
 */
async function s3_generateExportUrls(batch) {
    if (!batch.s3_metadata?.exports) {
        return null;
    }
    
    const urls = {};
    
    for (const [exportType, metadata] of Object.entries(batch.s3_metadata.exports)) {
        if (metadata.status === 'completed' && metadata.s3_key) {
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: metadata.s3_key
            });
            
            urls[exportType] = {
                url: await getSignedUrl(s3Client, command, { expiresIn: 86400 }), // 24 hours
                size: metadata.size,
                generatedAt: metadata.generated_at,
                fileName: metadata.s3_key.split('/').pop()
            };
        }
    }
    
    return urls;
}

/**
 * Map verification status for exports based on check type
 */
function mapStatus(status, isCatchall, checkType) {
    if (checkType === 'deliverable') {
        if (status === 'deliverable' && !isCatchall) return 'Deliverable';
        if (status === 'deliverable' && isCatchall) return 'Catch-All';
        if (status === 'risky') return 'Catch-All';
        if (status === 'undeliverable') return 'Undeliverable';
        if (status === 'unknown') return 'Unknown';
        return 'Not Processed';
    } else if (checkType === 'catchall') {
        // For catchall type batches
        if (status === 'good') return 'Good';
        if (status === 'bad') return 'Bad';
        if (status === 'risky') return 'Risky';
        return 'Not Processed';
    }
}

/**
 * Determine which exports to create based on check type
 */
function getExportTypes(checkType) {
    if (checkType === 'deliverable') {
        return {
            all_emails: true,
            valid_only: true,
            invalid_only: true,
            catchall_risky: true
        };
    } else if (checkType === 'catchall') {
        return {
            all_emails: true,
            good_only: true,
            bad_only: true,
            risky_only: true
        };
    }
}

/**
 * Parse Excel file from S3 stream
 */
async function parseExcelFromStream(stream) {
    // Excel files need to be fully loaded into memory
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to CSV string for consistent processing
    const csvData = XLSX.utils.sheet_to_csv(worksheet);
    return csvData;
}

/**
 * Trigger S3 enrichment with deduplication
 */
async function s3_triggerS3Enrichment(batchId, checkType, db_funcs) {
    const key = `${batchId}:${checkType}`;
    
    // Check if already processing
    if (enrichmentInProgress.has(key)) {
        console.log(`⏳ Enrichment already in progress for batch ${batchId}`);
        return enrichmentInProgress.get(key);
    }
    
    // Start new enrichment
    const enrichmentPromise = s3_enrichBatchExports(batchId, checkType, db_funcs)
        .finally(() => enrichmentInProgress.delete(key));
    
    enrichmentInProgress.set(key, enrichmentPromise);
    return enrichmentPromise;
}

/**
 * Main enrichment function that streams from S3, enriches, and creates exports
 */
async function s3_enrichBatchExports(batchId, checkType, db_funcs) {
    console.log(`🚀 Starting S3 enrichment for batch ${batchId} (${checkType})`);
    
    try {
        // 1. Get batch metadata with S3 key
        const batch = await db_funcs.db_s3_getBatchWithS3Metadata(batchId, checkType);
        if (!batch || !batch.s3_metadata?.original?.s3_key) {
            throw new Error('Batch not found or missing S3 metadata');
        }
        
        const originalS3Key = batch.s3_metadata.original.s3_key;
        const mimeType = batch.s3_metadata.original.mime_type || 'text/csv';
        const columnMapping = batch.s3_metadata.original.column_mapping || { email: 0 };
        
        // 2. Create progress tracking entry
        await db_funcs.db_s3_createEnrichmentProgress(batchId, checkType);
        
        // 3. Load all results into memory for O(1) lookup
        console.log(`📊 Loading batch results for ${batchId}...`);
        const results = await db_funcs.db_s3_getAllBatchResults(batchId, checkType);
        const resultsMap = new Map(
            results.map(r => [stripEmailModifiers(r.email_stripped.toLowerCase()), r])
        );
        console.log(`✅ Loaded ${results.length} results`);
        
        // 4. Download original file as stream
        const downloadCommand = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: originalS3Key
        });
        const downloadResponse = await s3Client.send(downloadCommand);
        
        // 5. Create output streams based on check type
        const exportTypes = getExportTypes(checkType);
        const outputStreams = {};
        const uploads = {};
        
        if (exportTypes.all_emails) {
            outputStreams.all_emails = new PassThrough();
            uploads.all_emails = createUpload(batchId, 'all-emails', outputStreams.all_emails);
        }
        
        if (exportTypes.valid_only) {
            outputStreams.valid_only = new PassThrough();
            uploads.valid_only = createUpload(batchId, 'valid-only', outputStreams.valid_only);
        }
        
        if (exportTypes.invalid_only) {
            outputStreams.invalid_only = new PassThrough();
            uploads.invalid_only = createUpload(batchId, 'invalid-only', outputStreams.invalid_only);
        }
        
        if (exportTypes.catchall_risky) {
            outputStreams.catchall_risky = new PassThrough();
            uploads.catchall_risky = createUpload(batchId, 'catchall-risky', outputStreams.catchall_risky);
        }
        
        if (exportTypes.good_only) {
            outputStreams.good_only = new PassThrough();
            uploads.good_only = createUpload(batchId, 'good-only', outputStreams.good_only);
        }
        
        if (exportTypes.bad_only) {
            outputStreams.bad_only = new PassThrough();
            uploads.bad_only = createUpload(batchId, 'bad-only', outputStreams.bad_only);
        }
        
        if (exportTypes.risky_only) {
            outputStreams.risky_only = new PassThrough();
            uploads.risky_only = createUpload(batchId, 'risky-only', outputStreams.risky_only);
        }
        
        // 6. Set up CSV stringifiers for each output
        const stringifiers = {};
        let headers = null;
        
        Object.keys(outputStreams).forEach(key => {
            stringifiers[key] = stringify({ header: true });
            stringifiers[key].pipe(outputStreams[key]);
        });
        
        // 7. Process the file
        let processedRows = 0;
        const updateInterval = 10000; // Update every 10k rows
        
        // Handle Excel files differently
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || originalS3Key.endsWith('.xlsx') || originalS3Key.endsWith('.xls')) {
            console.log('📊 Processing Excel file...');
            const csvData = await parseExcelFromStream(downloadResponse.Body);
            
            // Create a readable stream from the CSV data
            const csvStream = new PassThrough();
            csvStream.end(csvData);
            
            await processStream(csvStream, columnMapping, resultsMap, stringifiers, checkType, processedRows, updateInterval, batchId, db_funcs);
        } else {
            // Process CSV directly
            console.log('📄 Processing CSV file...');
            await processStream(downloadResponse.Body, columnMapping, resultsMap, stringifiers, checkType, processedRows, updateInterval, batchId, db_funcs);
        }
        
        // 8. Close all stringifiers
        Object.values(stringifiers).forEach(stringifier => stringifier.end());
        
        // 9. Wait for all uploads to complete
        console.log('⏳ Waiting for uploads to complete...');
        const uploadResults = await Promise.all(
            Object.entries(uploads).map(async ([type, upload]) => {
                const result = await upload.done();
                return { type, result };
            })
        );
        
        // 10. Update batch metadata with export info
        const exportMetadata = {};
        uploadResults.forEach(({ type, result }) => {
            exportMetadata[type] = {
                s3_key: result.Key,
                generated_at: new Date().toISOString(),
                size: result.ContentLength || 0,
                status: 'completed'
            };
        });
        
        await db_funcs.db_s3_updateBatchExportMetadata(batchId, checkType, exportMetadata);
        
        // 11. Mark enrichment as completed
        await db_funcs.db_s3_completeEnrichmentProgress(batchId, checkType, processedRows);
        
        console.log(`✅ S3 enrichment completed for batch ${batchId}. Processed ${processedRows} rows.`);
        
    } catch (error) {
        console.error(`❌ Enrichment failed for batch ${batchId}:`, error);
        
        // Update progress with error
        await db_funcs.db_s3_failEnrichmentProgress(batchId, checkType, error.message);
        
        // Update batch metadata with error
        await db_funcs.db_s3_updateBatchExportMetadata(batchId, checkType, {
            error: {
                message: error.message,
                timestamp: new Date().toISOString()
            }
        });
        
        throw error;
    }
}

/**
 * Process the stream and enrich data
 */
async function processStream(inputStream, columnMapping, resultsMap, stringifiers, checkType, processedRows, updateInterval, batchId, db_funcs) {
    return new Promise((resolve, reject) => {
        let isFirstRow = true;
        let headers = null;
        
        inputStream
            .pipe(parse({ 
                columns: true,
                skip_empty_lines: true,
                relax_quotes: true,
                relax_column_count: true
            }))
            .on('data', (row) => {
                processedRows++;
                
                // Update progress periodically
                if (processedRows % updateInterval === 0) {
                    db_funcs.db_s3_updateEnrichmentProgress(batchId, checkType, processedRows)
                        .catch(err => console.error('Failed to update progress:', err));
                }
                
                // Get email from appropriate column
                const rowKeys = Object.keys(row);
                const emailColumn = columnMapping.email;
                const email = row[rowKeys[emailColumn]]?.toLowerCase() || '';
                
                // Lookup result
                const strippedEmail = stripEmailModifiers(email);
                const result = resultsMap.get(strippedEmail) || {
                    status: 'not_processed',
                    reason: 'Email not found in batch'
                };
                
                // Create enriched row
                const enrichedRow = {
                    ...row,
                    'Verification Status': mapStatus(result.status, result.is_catchall, checkType),
                    'Reason': result.reason || '',
                    'Score': result.score || ''
                };
                
                // Add additional fields based on check type
                if (checkType === 'deliverable') {
                    enrichedRow['Mail Server'] = result.provider || '';
                } else if (checkType === 'catchall') {
                    enrichedRow['Toxicity'] = result.toxicity || '';
                }
                
                // Write to all emails export
                if (stringifiers.all_emails) {
                    stringifiers.all_emails.write(enrichedRow);
                }
                
                // Write to filtered exports based on status
                const status = enrichedRow['Verification Status'];
                
                if (checkType === 'deliverable') {
                    if (status === 'Deliverable' && stringifiers.valid_only) {
                        stringifiers.valid_only.write(enrichedRow);
                    } else if (status === 'Undeliverable' && stringifiers.invalid_only) {
                        stringifiers.invalid_only.write(enrichedRow);
                    } else if (status === 'Catch-All' && stringifiers.catchall_risky) {
                        stringifiers.catchall_risky.write(enrichedRow);
                    }
                } else if (checkType === 'catchall') {
                    if (status === 'Good' && stringifiers.good_only) {
                        stringifiers.good_only.write(enrichedRow);
                    } else if (status === 'Bad' && stringifiers.bad_only) {
                        stringifiers.bad_only.write(enrichedRow);
                    } else if (status === 'Risky' && stringifiers.risky_only) {
                        stringifiers.risky_only.write(enrichedRow);
                    }
                }
            })
            .on('end', () => {
                console.log(`✅ Finished processing ${processedRows} rows`);
                resolve();
            })
            .on('error', (error) => {
                console.error('❌ Stream processing error:', error);
                reject(error);
            });
    });
}

/**
 * Create an S3 multipart upload
 */
function createUpload(batchId, exportType, stream) {
    const timestamp = Date.now();
    const key = `exports/${batchId}/${exportType}-${timestamp}.csv`;
    
    return new Upload({
        client: s3Client,
        params: {
            Bucket: S3_BUCKET,
            Key: key,
            Body: stream,
            ContentType: 'text/csv'
        },
        partSize: 5 * 1024 * 1024, // 5MB parts
        queueSize: 4 // Max 4 concurrent parts
    });
}

module.exports = {
    s3_generateUploadUrl,
    s3_generateExportUrls,
    s3_triggerS3Enrichment,
    s3_enrichBatchExports
};