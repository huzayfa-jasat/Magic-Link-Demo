// Dependencies
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PassThrough } = require("stream");
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const XLSX = require('xlsx');

// Util Imports
const { stripEmailModifiers } = require('../../utils/processEmails');
const { getExportTitle } = require('./funs_s3_utils');

// Initialize S3 client
const s3Client = new S3Client({ 
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const S3_BUCKET = process.env.S3_BUCKET;

// Constants
const DELIVERABLE_EXPORT_TYPES = {
    all_emails: true,
    valid_only: true,
    invalid_only: true,
    catchall_only: true
};
const CATCHALL_EXPORT_TYPES = {
    all_emails: true,
    good_only: true,
    bad_only: true,
    risky_only: true
};

// In-progress enrichment tracking
const enrichmentInProgress = new Map();

/**
 * Generate a pre-signed URL for S3 upload
 */
async function s3_generateUploadUrl(fileName, fileSize, mimeType, batchId, checkType) {
    const timestamp = Date.now();
    const s3Key = `uploads/${checkType}/${batchId}/og-${timestamp}-${fileName}`;
    
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
async function s3_generateExportUrls(batch, ttl_seconds=86400) {
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
                url: await getSignedUrl(s3Client, command, { expiresIn: ttl_seconds }),
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
 * Note: This function now only receives valid statuses (risky, deliverable, undeliverable)
 * as filtering happens before this function is called
 */
function mapStatus(status, isCatchall, reason, checkType) {
    if (checkType === 'deliverable') {
        if (status === 'deliverable' && !isCatchall) return 'Valid';
        else if (isCatchall || (status === 'risky' && reason === 'low_deliverability')) return 'Catch-All';
        else if (status === 'undeliverable') return 'Invalid';
        // For risky status without low_deliverability reason
        else if (status === 'risky') return 'Invalid';
        else return 'Invalid'; // Fallback for any edge cases

    } else if (checkType === 'catchall') {
        switch (status) {
            case 'deliverable':
                return 'Good';
            case 'risky':
                return 'Risky';
            case 'undeliverable':
                return 'Bad';
            default:
                return 'Bad'; // Fallback for any edge cases
        }
    }
    
    // This should never be reached now since we filter before calling mapStatus
    return 'Unknown';
}

/**
 * Determine which exports to create based on check type
 */
function getExportTypes(checkType) {
    if (checkType === 'deliverable') return DELIVERABLE_EXPORT_TYPES;
    else if (checkType === 'catchall') return CATCHALL_EXPORT_TYPES;
    else return {};
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
        // IMPORTANT: r.email_stripped is already stripped in the database, don't strip again
        const resultsMap = new Map(
            results.map(r => [r.email_stripped.toLowerCase(), r])
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
            uploads.all_emails = createUpload(checkType, batchId, getExportTitle(checkType, 'all_emails', batch.title), outputStreams.all_emails);
        }
        
        if (exportTypes.valid_only) {
            outputStreams.valid_only = new PassThrough();
            uploads.valid_only = createUpload(checkType, batchId, getExportTitle(checkType, 'valid_only', batch.title), outputStreams.valid_only);
        }
        
        if (exportTypes.invalid_only) {
            outputStreams.invalid_only = new PassThrough();
            uploads.invalid_only = createUpload(checkType, batchId, getExportTitle(checkType, 'invalid_only', batch.title), outputStreams.invalid_only);
        }
        
        if (exportTypes.catchall_only) {
            outputStreams.catchall_only = new PassThrough();
            uploads.catchall_only = createUpload(checkType, batchId, getExportTitle(checkType, 'catchall_only', batch.title), outputStreams.catchall_only);
        }
        
        if (exportTypes.good_only) {
            outputStreams.good_only = new PassThrough();
            uploads.good_only = createUpload(checkType, batchId, getExportTitle(checkType, 'good_only', batch.title), outputStreams.good_only);
        }
        
        if (exportTypes.bad_only) {
            outputStreams.bad_only = new PassThrough();
            uploads.bad_only = createUpload(checkType, batchId, getExportTitle(checkType, 'bad_only', batch.title), outputStreams.bad_only);
        }
        
        if (exportTypes.risky_only) {
            outputStreams.risky_only = new PassThrough();
            uploads.risky_only = createUpload(checkType, batchId, getExportTitle(checkType, 'risky_only', batch.title), outputStreams.risky_only);
        }
        
        // 6. Set up CSV stringifiers for each output
        const stringifiers = {};
        const bomWritten = {}; // Track if BOM has been written for each stream
        Object.keys(outputStreams).forEach(key => {
            // Don't write BOM yet - will write it when first data row is written
            bomWritten[key] = false;
            
            stringifiers[key] = stringify({ header: true });
            stringifiers[key].pipe(outputStreams[key]);
        });
        
        // 7. Process the file
        const stats = { processedRows: 0 }; // Use object to pass by reference
        const updateInterval = 10000; // Update every 10k rows
        const rowCounts = {}; // Track row counts for each export type
        Object.keys(exportTypes).forEach(key => {
            rowCounts[key] = 0;
        });
        
        // Handle Excel files differently
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || originalS3Key.endsWith('.xlsx') || originalS3Key.endsWith('.xls')) {
            console.log('📊 Processing Excel file...');
            const csvData = await parseExcelFromStream(downloadResponse.Body);
            
            // Create a readable stream from the CSV data
            const csvStream = new PassThrough();
            csvStream.end(csvData);
            
            await processStream(csvStream, columnMapping, resultsMap, stringifiers, checkType, stats, updateInterval, batchId, db_funcs, rowCounts, outputStreams, bomWritten);
        } else {
            // Process CSV directly
            console.log('📄 Processing CSV file...');
            await processStream(downloadResponse.Body, columnMapping, resultsMap, stringifiers, checkType, stats, updateInterval, batchId, db_funcs, rowCounts, outputStreams, bomWritten);
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
                size: rowCounts[type] || 0,  // Use row count instead of file size
                status: 'completed'
            };
        });
        
        await db_funcs.db_s3_updateBatchExportMetadata(batchId, checkType, exportMetadata);
        
        // 11. Mark enrichment as completed
        await db_funcs.db_s3_completeEnrichmentProgress(batchId, checkType, stats.processedRows);
        
        console.log(`✅ S3 enrichment completed for batch ${batchId}. Processed ${stats.processedRows} rows.`);
        
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
async function processStream(inputStream, columnMapping, resultsMap, stringifiers, checkType, stats, updateInterval, batchId, db_funcs, rowCounts, outputStreams, bomWritten) {
    return new Promise((resolve, reject) => {
        let isFirstRow = true;
        let headers = null;
        let skippedNoEmail = 0;
        let skippedNoResult = 0;
        let skippedDuplicate = 0;
        let skippedInvalidStatus = 0;
        let firstRowLogged = false;
        
        inputStream
            .pipe(parse({ 
                columns: false,  // Use array format to preserve column order
                skip_empty_lines: true,
                skip_empty_columns: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true,  // Handle BOM in input files
                trim: true,  // Trim whitespace from values
                ltrim: true,  // Trim leading whitespace
                rtrim: true  // Trim trailing whitespace
            }))
            .on('data', (row) => {
                // Handle header row
                if (isFirstRow) {
                    headers = row;
                    isFirstRow = false;
                    
                    // Validate email column exists
                    const emailColumn = columnMapping.email;
                    if (emailColumn >= headers.length) {
                        console.error(`❌ CRITICAL: Column index ${emailColumn} not found. Total columns: ${headers.length}`);
                        console.error(`❌ Headers:`, headers);
                        console.error(`❌ Column mapping:`, columnMapping);
                        reject(new Error(`Email column index ${emailColumn} not found in CSV`));
                        return;
                    }
                    
                    console.log(`✅ Found email column at index ${emailColumn}: "${headers[emailColumn]}"`);
                    return; // Skip header row for processing
                }
                
                stats.processedRows++;
                
                // Log first few data rows for debugging
                if (stats.processedRows <= 3) {
                    console.log(`🔍 Row ${stats.processedRows} data:`, row);
                    console.log(`🔍 Row ${stats.processedRows} email column value:`, row[columnMapping.email]);
                }
                
                // Update progress periodically
                if (stats.processedRows % updateInterval === 0) {
                    db_funcs.db_s3_updateEnrichmentProgress(batchId, checkType, stats.processedRows)
                        .catch(err => console.error('Failed to update progress:', err));
                }
                
                // Get email from appropriate column index
                const emailColumn = columnMapping.email;
                const rawEmail = row[emailColumn];
                
                // Debug log for problematic rows
                if (stats.processedRows <= 5 && (!rawEmail || rawEmail.trim() === '')) {
                    console.log(`⚠️ Row ${stats.processedRows} has empty email at index ${emailColumn}. Value:`, rawEmail);
                }
                
                // Skip if no email value
                if (!rawEmail || rawEmail.trim() === '') {
                    skippedNoEmail++;
                    return;
                }
                
                const email = rawEmail.toLowerCase();
                const strippedEmail = stripEmailModifiers(email);
                
                if (!strippedEmail || strippedEmail === 'null' || strippedEmail === 'undefined') {
                    skippedNoEmail++;
                    return;
                }

                // Lookup result (skip if none found or already processed (duplicate))
                const result = resultsMap.get(strippedEmail);
                if (!result) {
                    if (skippedNoResult < 5) {
                        console.log(`⚠️ No result found for email: "${strippedEmail}" (original: "${email}")`);
                        console.log(`   First 5 keys in resultsMap:`, Array.from(resultsMap.keys()).slice(0, 5));
                    }
                    skippedNoResult++;
                    return;
                }
                if (result._processed) {
                    skippedDuplicate++;
                    return;
                }
                
                // Filter out results that are not "risky", "deliverable", or "undeliverable"
                if (!['risky', 'deliverable', 'undeliverable'].includes(result.status)) {
                    skippedInvalidStatus++;
                    return; // Skip this row entirely
                }
                
                // Mark as processed to avoid duplicates (memory-efficient approach)
                result._processed = true;
                
                // Create enriched row as object using headers
                const enrichedRow = {};
                headers.forEach((header, index) => {
                    enrichedRow[header] = row[index];
                });
                
                // Add status column
                const status_col_header = `OmniVerifier ${(checkType === 'deliverable') ? 'Status' : 'Catch-All Status'}`;
                enrichedRow[status_col_header] = mapStatus(result.status, result.is_catchall, result.reason, checkType);
                
                // Add additional fields based on check type
                if (checkType === 'deliverable') {
                    const provider_result = result.provider || '';
                    enrichedRow['OmniVerifier Mail Server'] = (provider_result === 'other') ? '' : provider_result;
                }
                
                // Write to all emails export
                if (stringifiers.all_emails) {
                    // Write BOM on first data write
                    if (!bomWritten.all_emails) {
                        outputStreams.all_emails.write(Buffer.from('\ufeff'));
                        bomWritten.all_emails = true;
                    }
                    stringifiers.all_emails.write(enrichedRow);
                    if (rowCounts) rowCounts.all_emails++;
                }
                
                // Write to filtered exports based on status
                const status = enrichedRow[status_col_header];
                
                if (checkType === 'deliverable') {
                    if (status === 'Valid' && stringifiers.valid_only) {
                        if (!bomWritten.valid_only) {
                            outputStreams.valid_only.write(Buffer.from('\ufeff'));
                            bomWritten.valid_only = true;
                        }
                        stringifiers.valid_only.write(enrichedRow);
                        if (rowCounts) rowCounts.valid_only++;
                    }
                    else if (status === 'Invalid' && stringifiers.invalid_only) {
                        if (!bomWritten.invalid_only) {
                            outputStreams.invalid_only.write(Buffer.from('\ufeff'));
                            bomWritten.invalid_only = true;
                        }
                        stringifiers.invalid_only.write(enrichedRow);
                        if (rowCounts) rowCounts.invalid_only++;
                    }
                    else if (status === 'Catch-All' && stringifiers.catchall_only) {
                        if (!bomWritten.catchall_only) {
                            outputStreams.catchall_only.write(Buffer.from('\ufeff'));
                            bomWritten.catchall_only = true;
                        }
                        stringifiers.catchall_only.write(enrichedRow);
                        if (rowCounts) rowCounts.catchall_only++;
                    }

                } else if (checkType === 'catchall') {
                    if (status === 'Good' && stringifiers.good_only) {
                        if (!bomWritten.good_only) {
                            outputStreams.good_only.write(Buffer.from('\ufeff'));
                            bomWritten.good_only = true;
                        }
                        stringifiers.good_only.write(enrichedRow);
                        if (rowCounts) rowCounts.good_only++;
                    }
                    else if (status === 'Bad' && stringifiers.bad_only) {
                        if (!bomWritten.bad_only) {
                            outputStreams.bad_only.write(Buffer.from('\ufeff'));
                            bomWritten.bad_only = true;
                        }
                        stringifiers.bad_only.write(enrichedRow);
                        if (rowCounts) rowCounts.bad_only++;
                    }
                    else if (status === 'Risky' && stringifiers.risky_only) {
                        if (!bomWritten.risky_only) {
                            outputStreams.risky_only.write(Buffer.from('\ufeff'));
                            bomWritten.risky_only = true;
                        }
                        stringifiers.risky_only.write(enrichedRow);
                        if (rowCounts) rowCounts.risky_only++;
                    }
                }
            })
            .on('end', () => {
                console.log(`✅ Finished processing ${stats.processedRows} rows`);
                console.log(`📊 Processing statistics:`);
                console.log(`  - Rows with no email: ${skippedNoEmail}`);
                console.log(`  - Rows with no matching result: ${skippedNoResult}`);
                console.log(`  - Duplicate rows: ${skippedDuplicate}`);
                console.log(`  - Rows with invalid status: ${skippedInvalidStatus}`);
                console.log(`  - Rows written to exports: ${Object.values(rowCounts).reduce((a, b) => a + b, 0)}`);
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
function createUpload(checkType, batchId, title, stream) {
    // Create upload key
    let file_key = `exports/${checkType}/${batchId}/${title}`;
    if (file_key.includes('.csv')) file_key = file_key.replaceAll('.csv', '');
    file_key = `${file_key}.csv`;
    
    // Create upload
    return new Upload({
        client: s3Client,
        params: {
            Bucket: S3_BUCKET,
            Key: file_key,
            Body: stream,
            ContentType: 'text/csv; charset=utf-8'
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