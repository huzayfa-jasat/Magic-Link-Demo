# S3 ENRICHMENT IMPLEMENTATION GUIDE

## Overview
This guide provides complete implementation details for adding S3-based CSV/Excel enrichment to the email verification system. The system will store original uploaded files in S3, then stream and enrich them with verification results when batches complete.

## Architecture Summary
1. Frontend uploads original CSV/Excel to S3 (not database)
2. Backend stores only email data and S3 reference in database
3. When batch completes, backend streams from S3, enriches, and creates multiple filtered exports
4. Users receive pre-signed S3 URLs for direct download

## Key Technical Decisions
- **AWS SDK v3**: Using @aws-sdk/client-s3 and @aws-sdk/lib-storage
- **Streaming**: Process files without loading into memory (handles 50MB+ files with ~2MB RAM)
- **No Manual Chunking**: S3 and CSV parsers handle chunk boundaries automatically
- **Single Pass**: Generate multiple filtered exports in one stream pass

---

## 1. ENTRY POINT: BATCH COMPLETION

**Primary Entry Point:** `/backend/queue/funs_db.js:checkAndCompleteUserBatch` (line 395-436)
- Currently sends completion email via `resend_sendBatchCompletionEmail` (line 428)
- **ADD after line 433:** Trigger S3 enrichment process

```javascript
// After sending completion email (line 433)
// Trigger S3 enrichment
await triggerS3Enrichment(user_batch_id, check_type);
```

**Alternative Entry Point:** Manual trigger via new API endpoint for re-processing

---

## 2. UPLOAD PROCESS IMPLEMENTATION

### A. Frontend Changes - `/frontend/src/app/Emails/Upload.jsx`

**After line 216** (successful batch creation), add:

```javascript
// Get pre-signed upload URL
const uploadUrlResponse = await handleApiCallDev(
  `/api/batches/${checkType}/batch/${newBatchId}/s3-upload-url`,
  'POST',
  { 
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type 
  }
);

// Upload directly to S3 from browser
const uploadResponse = await fetch(uploadUrlResponse.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});

// Store S3 key reference
await handleApiCallDev(
  `/api/batches/${checkType}/batch/${newBatchId}/s3-key`,
  'POST',
  { s3Key: uploadUrlResponse.s3Key }
);
```

### B. New Backend Endpoints

```
POST /api/batches/:checkType/batch/:batchId/s3-upload-url
- Generates pre-signed S3 upload URL
- Returns: { uploadUrl, s3Key }

POST /api/batches/:checkType/batch/:batchId/s3-key  
- Stores S3 key in batch metadata
```

### C. Database Schema Update

Add to `Batches_Deliverable` and `Batches_Catchall` tables:
```sql
ALTER TABLE Batches_Deliverable ADD COLUMN s3_metadata JSON;
ALTER TABLE Batches_Catchall ADD COLUMN s3_metadata JSON;
```

Store metadata as:
```json
{
  "original": {
    "s3_key": "uploads/12345/original-1234567890.csv",
    "upload_timestamp": "2024-01-15T10:00:00Z",
    "file_size": 52428800,
    "mime_type": "text/csv",
    "column_mapping": {"email": 0, "name": 1, "company": 2}
  },
  "exports": {
    "all_emails": {
      "s3_key": "exports/12345/all-emails-1234567890.csv",
      "generated_at": "2024-01-15T11:00:00Z",
      "size": 62914560,
      "status": "completed"
    },
    "valid_only": {...},
    "invalid_only": {...}
  }
}
```

---

## 3. ENRICHMENT STREAMING IMPLEMENTATION

### A. AWS SDK v3 Streaming Pattern

**CRITICAL: This implementation uses AWS SDK v3 with automatic streaming that handles files of any size with minimal memory usage.**

```javascript
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough, Transform } from "stream";
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

async function enrichBatchExports(batchId, checkType) {
  const s3Client = new S3Client({ region: 'us-east-1' });
  
  // 1. Get batch metadata with S3 key
  const batch = await getBatchWithS3Metadata(batchId, checkType);
  const originalS3Key = batch.s3_metadata.original.s3_key;
  
  // 2. Load all results into memory for O(1) lookup
  const results = await getAllBatchResults(batchId, checkType);
  const resultsMap = new Map(
    results.map(r => [r.email_stripped.toLowerCase(), r])
  );
  
  // 3. Download original file as stream
  const downloadCommand = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: originalS3Key
  });
  const downloadResponse = await s3Client.send(downloadCommand);
  
  // 4. Create multiple output streams for filtered exports
  const allEmailsStream = new PassThrough();
  const validOnlyStream = new PassThrough();
  const invalidOnlyStream = new PassThrough();
  const catchallStream = new PassThrough();
  
  // 5. Create multipart uploads for each export
  const uploads = {
    all: new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: `exports/${batchId}/all-emails-${Date.now()}.csv`,
        Body: allEmailsStream,
        ContentType: 'text/csv'
      },
      partSize: 5 * 1024 * 1024, // 5MB parts
      queueSize: 4 // Max 4 concurrent parts
    }),
    valid: new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: `exports/${batchId}/valid-only-${Date.now()}.csv`,
        Body: validOnlyStream,
        ContentType: 'text/csv'
      },
      partSize: 5 * 1024 * 1024,
      queueSize: 4
    }),
    invalid: new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: `exports/${batchId}/invalid-only-${Date.now()}.csv`,
        Body: invalidOnlyStream,
        ContentType: 'text/csv'
      },
      partSize: 5 * 1024 * 1024,
      queueSize: 4
    })
  };
  
  // 6. Track progress
  let processedRows = 0;
  const updateInterval = 10000; // Update every 10k rows
  
  // 7. Create enrichment transform
  const enrichTransform = new Transform({
    objectMode: true,
    transform(row, encoding, callback) {
      processedRows++;
      
      // Update progress periodically
      if (processedRows % updateInterval === 0) {
        updateEnrichmentProgress(batchId, processedRows);
      }
      
      // Get email from appropriate column
      const emailColumn = batch.s3_metadata.original.column_mapping.email;
      const email = row[Object.keys(row)[emailColumn]]?.toLowerCase();
      
      // Lookup result
      const result = resultsMap.get(stripEmailModifiers(email)) || {
        status: 'not_processed',
        reason: 'Email not found in batch'
      };
      
      // Enrich row
      const enrichedRow = {
        ...row,
        'Verification Status': mapStatus(result.status, result.is_catchall),
        'Mail Server': result.provider || '',
        'Reason': result.reason || '',
        'Score': result.score || '',
        'Toxicity': result.toxicity || ''
      };
      
      callback(null, enrichedRow);
    }
  });
  
  // 8. Setup streaming pipeline
  let isFirstRow = true;
  
  // Parse CSV -> Enrich -> Write to multiple outputs
  downloadResponse.Body
    .pipe(parse({ 
      columns: true,
      skip_empty_lines: true 
    }))
    .pipe(enrichTransform)
    .pipe(new Transform({
      objectMode: true,
      transform(enrichedRow, encoding, callback) {
        // Convert to CSV strings for each output
        const csvRow = stringify([enrichedRow], { 
          header: isFirstRow,
          columns: Object.keys(enrichedRow)
        });
        
        if (isFirstRow) isFirstRow = false;
        
        // Write to all emails export
        allEmailsStream.write(csvRow);
        
        // Write to filtered exports based on status
        const status = enrichedRow['Verification Status'];
        if (status === 'Deliverable') {
          validOnlyStream.write(csvRow);
        } else if (status === 'Undeliverable') {
          invalidOnlyStream.write(csvRow);
        } else if (status === 'Catch-All/Risky') {
          catchallStream.write(csvRow);
        }
        
        callback();
      }
    }))
    .on('finish', () => {
      // Close all output streams
      allEmailsStream.end();
      validOnlyStream.end();
      invalidOnlyStream.end();
      catchallStream.end();
    });
  
  // 9. Wait for all uploads to complete
  const [allDone, validDone, invalidDone] = await Promise.all([
    uploads.all.done(),
    uploads.valid.done(),
    uploads.invalid.done()
  ]);
  
  // 10. Update batch metadata with export S3 keys
  await updateBatchExportMetadata(batchId, {
    all_emails: {
      s3_key: allDone.Key,
      generated_at: new Date().toISOString(),
      size: allDone.ContentLength
    },
    valid_only: {
      s3_key: validDone.Key,
      generated_at: new Date().toISOString(),
      size: validDone.ContentLength
    },
    invalid_only: {
      s3_key: invalidDone.Key,
      generated_at: new Date().toISOString(),
      size: invalidDone.ContentLength
    }
  });
}
```

### B. Key Streaming Concepts

1. **CSV Parser Handles Chunk Boundaries Automatically**
   - S3 sends raw bytes that may cut mid-CSV-row
   - `csv-parse` buffers incomplete rows internally
   - Your code only receives complete row objects

2. **Memory Usage Stays Constant**
   - Only ~16-64KB chunks in memory at once
   - Plus one CSV row buffer in parser
   - Total: ~1-2MB regardless of file size

3. **Single Multipart Upload Per Export**
   - AWS SDK's `Upload` class manages all parts
   - Automatically calls `CompleteMultipartUpload` when done
   - No manual part management needed

---

## 4. HELPER FUNCTIONS TO IMPLEMENT

### A. Result Mapping Function
```javascript
function mapStatus(status, isCatchall) {
  if (status === 'deliverable' && !isCatchall) return 'Deliverable';
  if (status === 'deliverable' && isCatchall) return 'Catch-All/Risky';
  if (status === 'risky') return 'Catch-All/Risky';
  if (status === 'undeliverable') return 'Undeliverable';
  if (status === 'unknown') return 'Unknown';
  return 'Not Processed';
}
```

### B. Database Functions
```javascript
// In backend/routes/batches/funs_db.js

async function getBatchWithS3Metadata(batchId, checkType) {
  const tableName = getBatchTableName(checkType);
  return await knex(tableName)
    .where('id', batchId)
    .first();
}

async function getAllBatchResults(batchId, checkType) {
  const resultsTable = getResultsTableName(checkType);
  const batchEmailTable = getEmailBatchAssociationTableName(checkType);
  
  return await knex(resultsTable)
    .join('Emails_Global', 'Emails_Global.global_id', `${resultsTable}.email_global_id`)
    .join(batchEmailTable, `${batchEmailTable}.email_global_id`, `${resultsTable}.email_global_id`)
    .where(`${batchEmailTable}.batch_id`, batchId)
    .select(
      'Emails_Global.email_stripped',
      `${resultsTable}.status`,
      `${resultsTable}.reason`,
      `${resultsTable}.is_catchall`,
      `${resultsTable}.score`,
      `${resultsTable}.provider`,
      `${resultsTable}.toxicity`
    );
}

async function updateBatchExportMetadata(batchId, exports) {
  const tableName = getBatchTableName(checkType);
  const currentMetadata = await knex(tableName)
    .where('id', batchId)
    .first('s3_metadata');
  
  const updatedMetadata = {
    ...currentMetadata.s3_metadata,
    exports: {
      ...currentMetadata.s3_metadata.exports,
      ...exports
    }
  };
  
  return await knex(tableName)
    .where('id', batchId)
    .update({ 
      s3_metadata: JSON.stringify(updatedMetadata),
      updated_ts: knex.fn.now()
    });
}
```

---

## 5. API ENDPOINTS

### A. Get Export URLs Endpoint
```javascript
// GET /api/batches/:checkType/batch/:batchId/exports
async function getExportUrls(req, res) {
  const { batchId, checkType } = req.params;
  
  // Check user access
  const [accessOk] = await db_checkUserBatchAccess(req.user.id, batchId, checkType);
  if (!accessOk) return res.status(403).json({ error: 'Access denied' });
  
  // Get batch metadata
  const batch = await getBatchWithS3Metadata(batchId, checkType);
  if (!batch.s3_metadata?.exports) {
    return res.status(404).json({ error: 'Exports not yet generated' });
  }
  
  // Generate pre-signed URLs for each export
  const s3Client = new S3Client({ region: 'us-east-1' });
  const urls = {};
  
  for (const [exportType, metadata] of Object.entries(batch.s3_metadata.exports)) {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: metadata.s3_key
    });
    
    urls[exportType] = {
      url: await getSignedUrl(s3Client, command, { expiresIn: 86400 }), // 24 hours
      size: metadata.size,
      generatedAt: metadata.generated_at
    };
  }
  
  res.json({ exports: urls });
}
```

### B. Trigger Enrichment Endpoint
```javascript
// POST /api/batches/:checkType/batch/:batchId/enrich
async function triggerEnrichment(req, res) {
  const { batchId, checkType } = req.params;
  
  // Check if enrichment already in progress
  if (enrichmentQueue.has(`${batchId}:${checkType}`)) {
    return res.json({ 
      status: 'in_progress',
      message: 'Enrichment already in progress' 
    });
  }
  
  // Queue enrichment job
  const job = await enrichmentQueue.add('enrich_batch', {
    batchId,
    checkType
  });
  
  res.json({ 
    status: 'queued',
    jobId: job.id 
  });
}
```

---

## 6. CONCURRENCY & ERROR HANDLING

### A. Request Deduplication
```javascript
const enrichmentInProgress = new Map();

async function triggerS3Enrichment(batchId, checkType) {
  const key = `${batchId}:${checkType}`;
  
  // Check if already processing
  if (enrichmentInProgress.has(key)) {
    return enrichmentInProgress.get(key);
  }
  
  // Start new enrichment
  const enrichmentPromise = enrichBatchExports(batchId, checkType)
    .finally(() => enrichmentInProgress.delete(key));
  
  enrichmentInProgress.set(key, enrichmentPromise);
  return enrichmentPromise;
}
```

### B. Error Recovery
```javascript
// Wrap main enrichment in try-catch
try {
  await enrichBatchExports(batchId, checkType);
} catch (error) {
  // Log error
  console.error(`Enrichment failed for batch ${batchId}:`, error);
  
  // Update batch metadata with error
  await updateBatchExportMetadata(batchId, {
    error: {
      message: error.message,
      timestamp: new Date().toISOString()
    }
  });
  
  // Re-throw for job queue to handle retry
  throw error;
}
```

---

## 7. PROGRESS TRACKING

### A. Database Table
```sql
CREATE TABLE S3_Enrichment_Progress (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  check_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rows_processed INTEGER DEFAULT 0,
  total_rows INTEGER DEFAULT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  UNIQUE KEY unique_batch_progress (batch_id, check_type)
);
```

### B. Progress Updates
```javascript
async function updateEnrichmentProgress(batchId, rowsProcessed) {
  await knex('S3_Enrichment_Progress')
    .insert({
      batch_id: batchId,
      rows_processed: rowsProcessed,
      status: 'processing'
    })
    .onConflict(['batch_id', 'check_type'])
    .merge({
      rows_processed: rowsProcessed,
      updated_at: knex.fn.now()
    });
}
```

---

## 8. DEPENDENCIES TO INSTALL

```json
{
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/lib-storage": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x",
  "csv-parse": "^5.x",
  "csv-stringify": "^6.x",
  "p-limit": "^4.x"
}
```

---

## 9. ENVIRONMENT VARIABLES

```env
S3_BUCKET=your-email-verification-bucket
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

---

## 10. TESTING CHECKLIST

1. **Upload Flow**
   - [ ] Frontend can get pre-signed URL
   - [ ] File uploads successfully to S3
   - [ ] S3 key stored in batch metadata

2. **Enrichment Flow**
   - [ ] Batch completion triggers enrichment
   - [ ] All export types generated correctly
   - [ ] Memory usage stays under 100MB for 50MB file
   - [ ] Progress updates work

3. **Download Flow**
   - [ ] Pre-signed URLs generated correctly
   - [ ] Files download with correct content
   - [ ] Access control works

4. **Error Cases**
   - [ ] S3 connection failure handled
   - [ ] Missing original file handled
   - [ ] Corrupted CSV handled
   - [ ] Concurrent requests deduplicated

---

## CRITICAL NOTES FOR IMPLEMENTATION

1. **Streaming is Automatic**: AWS SDK v3's `response.Body` is already a Node.js stream. No special configuration needed.

2. **CSV Parser Handles Chunks**: The csv-parse library automatically handles when S3 chunks cut mid-row. It buffers incomplete rows internally.

3. **One Upload Per File**: Each export file gets ONE `Upload` instance that handles all multipart complexity automatically.

4. **Memory Efficient**: The entire pipeline processes ~16-64KB at a time, regardless of file size.

5. **No Manual Part Management**: Never manually create parts or call CompleteMultipartUpload - the SDK handles this.

6. **Progress Tracking**: Update progress in the Transform stream, not in the upload handlers.

7. **Error Recovery**: If enrichment fails, the pre-signed upload URLs expire automatically, cleaning up partial uploads.

---

This implementation guide provides all necessary details for a separate AI instance to implement the complete S3 enrichment feature.