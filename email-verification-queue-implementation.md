# Email Verification Queue System Implementation

## Overview

This document outlines the implementation of a BullMQ-based queue system for handling email verification through the Bouncer API. The system supports two verification types: **deliverability** and **catchall**, with completely separate queue processing for each type.

## System Architecture

### Core Components

1. **Email Preprocessing Service** (validation, deduplication, parsing)
2. **Bouncer API Wrapper** (`backend/external_apis/bouncer.js`)
3. **Queue Processors** (BullMQ workers)
4. **Database Layer** (for persistence and result storage)
5. **Queue Management** (job scheduling and monitoring)

## Email Preprocessing Pipeline

### Preprocessing Service Requirements

The preprocessing service handles all email validation and preparation **before** any emails reach the Bouncer API. This ensures the Bouncer API functions only receive clean, validated data.

#### Input Processing
```javascript
// User uploads file → Raw email extraction
function extractEmailsFromFile(file) {
  // 1. Parse CSV, TXT, or other supported formats
  // 2. Extract email addresses from various column formats
  // 3. Handle different delimiters (comma, semicolon, newline)
  // 4. Return raw array of potential email strings
}
```

#### Email Validation Pipeline
```javascript
function validateEmails(rawEmails) {
  const validEmails = [];
  const invalidEmails = [];
  
  for (const email of rawEmails) {
    // Basic format validation
    if (!email.includes('@')) {
      invalidEmails.push({ email, reason: 'missing_at_symbol' });
      continue;
    }
    
    const [localPart, domain] = email.split('@');
    
    // Local part validation
    if (!localPart || localPart.length === 0) {
      invalidEmails.push({ email, reason: 'missing_local_part' });
      continue;
    }
    
    // Domain validation
    if (!domain || !domain.includes('.')) {
      invalidEmails.push({ email, reason: 'invalid_domain' });
      continue;
    }
    
    // TLD validation (basic check for at least 2 chars after last dot)
    const tld = domain.split('.').pop();
    if (!tld || tld.length < 2) {
      invalidEmails.push({ email, reason: 'invalid_tld' });
      continue;
    }
    
    validEmails.push(email.toLowerCase().trim());
  }
  
  return { validEmails, invalidEmails };
}
```

#### Deduplication Process
```javascript
function deduplicateEmails(emails) {
  // Remove duplicates within the submission
  const uniqueEmails = [...new Set(emails)];
  const duplicateCount = emails.length - uniqueEmails.length;
  
  return { uniqueEmails, duplicateCount };
}
```

#### Database Existence Check
```javascript
async function filterExistingResults(emails, verificationType) {
  // Query existing results to avoid re-verification
  const existingResults = await db('Bouncer_Results')
    .join('Contacts_Global', 'Bouncer_Results.global_id', 'Contacts_Global.global_id')
    .where('verification_type', verificationType)
    .whereIn('Contacts_Global.email', emails)
    .select('Contacts_Global.email', 'Bouncer_Results.bouncer_status');
  
  const existingEmails = new Set(existingResults.map(r => r.email));
  const freshEmails = emails.filter(email => !existingEmails.has(email));
  
  return { freshEmails, existingResults };
}
```

#### Final Processing Flow
```javascript
async function preprocessEmailSubmission(file, verificationType, userId, requestId) {
  // 1. Extract raw emails from file
  const rawEmails = extractEmailsFromFile(file);
  
  // 2. Validate email formats
  const { validEmails, invalidEmails } = validateEmails(rawEmails);
  
  // 3. Deduplicate valid emails
  const { uniqueEmails, duplicateCount } = deduplicateEmails(validEmails);
  
  // 4. Check for existing results
  const { freshEmails, existingResults } = await filterExistingResults(uniqueEmails, verificationType);
  
  // 5. Insert fresh emails into queue
  if (freshEmails.length > 0) {
    await insertEmailsIntoQueue(freshEmails, verificationType, userId, requestId);
    await triggerBatchProcessing(verificationType);
  }
  
  return {
    submitted: rawEmails.length,
    invalid: invalidEmails.length,
    duplicates: duplicateCount,
    existing: existingResults.length,
    queued: freshEmails.length
  };
}
```

## Database Design

### Required Tables

The system leverages the existing bouncer schema with modifications for dual queue support:

#### 1. Bouncer_Batches (Modified)
```sql
ALTER TABLE Bouncer_Batches ADD COLUMN verification_type ENUM('deliverability', 'catchall') NOT NULL;
```

**Purpose**: Track batches submitted to Bouncer API
**Key Fields**:
- `verification_type`: Distinguishes between deliverability and catchall batches
- `batch_id`: Bouncer API batch identifier
- `status`: Current processing status
- `user_id`, `request_id`: Link to user and request

#### 2. Bouncer_Queue (Modified)  
```sql
ALTER TABLE Bouncer_Queue ADD COLUMN verification_type ENUM('deliverability', 'catchall') NOT NULL;
```

**Purpose**: Queue individual emails awaiting batch assignment
**Key Fields**:
- `verification_type`: Queue separation for deliverability vs catchall
- `global_id`: Reference to email record
- `status`: queued → assigned → completed/failed
- `priority`: Queue ordering (higher = higher priority)

#### 3. Bouncer_Results (Modified)
```sql
ALTER TABLE Bouncer_Results ADD COLUMN verification_type ENUM('deliverability', 'catchall') NOT NULL;
```

**Purpose**: Store verification results from Bouncer API
**Key Fields**:
- `verification_type`: Result type classification
- `bouncer_status`: API result (deliverable, undeliverable, catchall, etc.)
- `domain_info`, `account_info`: Detailed verification data

## Queue System Design

### Queue Structure

#### 1. Deliverability Verification Queue
- **Queue Name**: `deliverability-verification`
- **Concurrency**: 5 workers
- **Rate Limiting**: Respects Bouncer API limits (200 req/min)
- **Job Types**:
  - `process-deliverability-batch`: Create and submit batch to Bouncer
  - `check-deliverability-status`: Poll batch status
  - `download-deliverability-results`: Retrieve and store results

#### 2. Catchall Verification Queue  
- **Queue Name**: `catchall-verification`
- **Concurrency**: 5 workers  
- **Rate Limiting**: Separate rate limiting from deliverability
- **Job Types**:
  - `process-catchall-batch`: Create and submit batch to Bouncer
  - `check-catchall-status`: Poll batch status
  - `download-catchall-results`: Retrieve and store results

### Job Flow Architecture

#### Phase 1: Email Ingestion & Preprocessing
```
User uploads email list (CSV, TXT, etc.)
    ↓
Parse and extract individual emails
    ↓
Validate email format:
  - Contains "@" symbol
  - Has valid domain structure
  - Has valid TLD
  - Remove obviously malformed emails
    ↓
Deduplicate emails within submission
    ↓
Check database for existing results
    ↓
Filter out already-verified emails
    ↓
Insert remaining "fresh" emails into Bouncer_Queue
    ↓
Trigger batch processing job
```

#### Phase 2: Batch Processing
```
BatchProcessor job triggered
    ↓
Query Bouncer_Queue for up to 10k queued emails
    ↓
Group emails by verification_type (deliverability vs catchall)
    ↓
For each group (≤10k emails):
  - Create batch via Bouncer API (emails already validated)
  - Store batch_id in Bouncer_Batches
  - Update email records: queued → assigned
    ↓
Schedule status check job (delay: 30 seconds)
```

#### Phase 3: Status Monitoring
```
StatusChecker job runs
    ↓
Call Bouncer API: checkBatch(batch_id)
    ↓
If status = "processing":
    - Schedule another status check (delay: 60 seconds)
If status = "completed":
    - Schedule results download job (immediate)
If status = "failed":
    - Move to dead letter queue
    - Schedule retry if attempts < max_retries
```

#### Phase 4: Results Processing
```
ResultsDownloader job runs
    ↓
Call Bouncer API: getBatchResults(batch_id)
    ↓
Parse and validate results
    ↓
Store results in Bouncer_Results table
    ↓
Update Bouncer_Batches: status = "completed"
    ↓
Update Bouncer_Queue: assigned → completed
    ↓
Trigger cleanup job for old records
```

## Queue Configuration

### Job Definitions

#### 1. Process Batch Job
```javascript
{
  name: 'process-deliverability-batch' | 'process-catchall-batch',
  data: {
    verification_type: 'deliverability' | 'catchall',
    user_id: number,
    request_id: number,
    priority: 'high' | 'normal' | 'low'
  },
  opts: {
    priority: 10-1 (high to low),
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
}
```

#### 2. Status Check Job
```javascript
{
  name: 'check-deliverability-status' | 'check-catchall-status',
  data: {
    batch_id: string,
    verification_type: 'deliverability' | 'catchall',
    bouncer_batch_id: number
  },
  opts: {
    delay: 30000, // 30 seconds initial delay
    attempts: 10,
    backoff: {
      type: 'fixed',
      delay: 60000 // 1 minute between checks
    }
  }
}
```

#### 3. Download Results Job
```javascript
{
  name: 'download-deliverability-results' | 'download-catchall-results',
  data: {
    batch_id: string,
    verification_type: 'deliverability' | 'catchall',
    bouncer_batch_id: number
  },
  opts: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
}
```

## Data Flow Specifications

### Input Data Format
```javascript
// User submission
{
  emails: [
    { email: 'user@example.com', name: 'John Doe' },
    { email: 'test@domain.com', name: 'Jane Smith' }
  ],
  verification_type: 'deliverability' | 'catchall',
  user_id: 123,
  request_id: 456,
  priority: 'normal'
}
```

### Queue Data Format
```javascript
// Bouncer_Queue record
{
  queue_id: 1,
  global_id: 789,
  user_id: 123,
  request_id: 456,
  verification_type: 'deliverability',
  batch_id: null, // null until assigned
  status: 'queued',
  priority: 0,
  domain_hash: 'hash_of_domain',
  created_ts: '2024-01-01 10:00:00'
}
```

### Batch Data Format
```javascript
// Bouncer_Batches record
{
  id: 1,
  batch_id: 'bouncer_abc123',
  user_id: 123,
  request_id: 456,
  verification_type: 'deliverability',
  status: 'processing',
  quantity: 10000,
  duplicates: 5,
  created_ts: '2024-01-01 10:00:00',
  retry_count: 0
}
```

### Results Data Format
```javascript
// Bouncer_Results record
{
  batch_id: 1,
  global_id: 789,
  verification_type: 'deliverability',
  bouncer_status: 'deliverable',
  bouncer_reason: 'accepted_email',
  domain_info: { /* JSON object */ },
  account_info: { /* JSON object */ },
  dns_info: { /* JSON object */ },
  provider: 'gmail',
  score: 95,
  toxic: 'false',
  toxicity: 0,
  processed_ts: '2024-01-01 10:05:00'
}
```

## BullMQ Implementation Details

### Queue Setup
```javascript
// Queue initialization with Redis connection
const deliverabilityQueue = new Queue('deliverability-verification', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

const catchallQueue = new Queue('catchall-verification', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential', 
      delay: 5000
    }
  }
});
```

### Worker Configuration
```javascript
// Separate workers for each verification type
const deliverabilityWorker = new Worker('deliverability-verification', 
  deliverabilityProcessor, {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 100, // Max 100 jobs per minute
      duration: 60000
    }
  }
);

const catchallWorker = new Worker('catchall-verification',
  catchallProcessor, {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 100, // Max 100 jobs per minute  
      duration: 60000
    }
  }
);
```

### Rate Limiting Strategy
```javascript
// Global rate limiter shared across both queues
class BouncerRateLimiter {
  constructor() {
    this.windowSize = 60000; // 1 minute
    this.maxRequests = 180; // Buffer below 200 limit
  }
  
  async checkRateLimit() {
    // Query Bouncer_Rate_Limit table
    // Count requests in current window
    // Return true if under limit, false if exceeded
  }
  
  async recordRequest() {
    // Insert request timestamp into Bouncer_Rate_Limit
  }
  
  async cleanupOldRecords() {
    // Remove records older than window size
  }
}
```

## Error Handling Strategy

### Error Classification
1. **Rate Limit Errors (429)**: Delay job, don't count as failure
2. **Payment Errors (402)**: Move to dead letter queue immediately  
3. **API Errors (5xx)**: Retry with exponential backoff
4. **Network Errors**: Retry with exponential backoff
5. **Validation Errors (4xx)**: Fail immediately, log for review

### Retry Logic
```javascript
const retryConfig = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // Start with 5 second delay
    settings: {
      multiplier: 2,
      maxDelay: 300000 // Max 5 minutes
    }
  }
};
```

### Dead Letter Queue
Failed jobs after max retries are moved to `Bouncer_Dead_Letter_Queue` table for manual review.

## Monitoring and Health Checks

### Queue Metrics
- Active job count per queue
- Waiting job count per queue  
- Completed/failed job ratio
- Average processing time
- Rate limit utilization

### Health Indicators
- Redis connectivity
- Database connectivity
- Bouncer API availability
- Queue backlog size
- Error rate thresholds

### Alerting Thresholds
- Queue backlog > 1000 items
- Failed job rate > 5%
- Rate limit utilization > 90%
- API response time > 30 seconds

## Implementation Priority

### Phase 1: Core Infrastructure
1. Modify database schema for dual verification types
2. Implement Bouncer API wrapper functions
3. Create basic queue processors for each type

### Phase 2: Queue Management  
1. Implement job scheduling and status monitoring
2. Add rate limiting and error handling
3. Create results processing and storage

### Phase 3: Monitoring and Optimization
1. Add health checks and monitoring
2. Implement dead letter queue handling
3. Performance optimization and scaling

This implementation provides a robust, scalable foundation for handling both deliverability and catchall email verification through separate, managed queues while maintaining data integrity and API compliance.