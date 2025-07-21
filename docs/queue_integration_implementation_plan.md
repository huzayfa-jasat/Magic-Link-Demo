# BullMQ Queue Integration Implementation Plan - CORRECTED

## Overview
Implement a BullMQ-based queue system that lives **completely separately** from user batch creation. Queue pings database periodically to greedily create 10k bouncer batches from pending user requests. Follows KISS principles with only 2 job types.

## File Structure (SIMPLIFIED)
- `backend/queue/queue_manager.js` - Main queue setup and management
- `backend/queue/workers/batch_creator_worker.js` - Greedy batch creation worker  
- `backend/queue/workers/status_checker_worker.js` - Status monitoring & result downloader

## 1. Dependencies & Setup

### Required NPM Packages
```bash
npm install bullmq redis
```

### Environment Variables
- `REDIS_URL` - Redis connection string for BullMQ
- `BATCH_CREATE_INTERVAL` - Seconds between batch creation attempts (default: 5)

## 2. Queue Manager Setup (`backend/queue/queue_manager.js`)

### Redis Connection
- Import `Queue`, `Worker` from 'bullmq'
- Create Redis connection using `REDIS_URL` environment variable
- Handle Redis connection errors and retries

### Queue Definition (SIMPLIFIED)
- **Main Queue**: `bouncer-queue`
- **Job Types**: Only 2 types
  - `greedy_batch_creator` - Creates bouncer batches greedily every 5 seconds
  - `status_checker` - Monitors outstanding bouncer batches

### Queue Events
- `completed` event: Log successful job completion
- `failed` event: Log failure (NO retries per requirements)
- `stalled` event: Handle stalled jobs, reassign to different worker

## 3. Worker System Implementation (2 WORKERS ONLY)

### Batch Creator Worker (`backend/queue/workers/batch_creator_worker.js`)

#### Job Responsibility
- Runs every 5 seconds via repeating job
- **Completely independent** of user batch creation process
- Greedily scans database for pending user batches
- Creates optimal 10k bouncer batches, respecting 15 concurrent limit

#### Process Flow (MULTI-BATCH GREEDY APPROACH)
1. **Check Available Capacity**: Call `db_getOutstandingBouncerBatchCount(check_type)` 
   - Returns `available_capacity` (e.g., 5 batches available out of 15 max)
2. **Initial Rate Limit Check**: Call `db_checkRateLimit(check_type, 'create_batch')`
3. **Create Multiple Batches Loop**: For each available capacity slot:
   ```javascript
   for (let i = 0; i < available_capacity; i++) {
     // Get 10k emails for this batch (FIFO ordered)
     const emails = await db_getEmailsForGreedyBatch(check_type, 10000);
     if (emails.length === 0) break; // No more pending emails
     
     // Create bouncer batch via API
     const bouncer_batch_id = await BouncerAPI.createBatch(emails);
     
     // Update database with batch assignment
     await db_assignBouncerBatchId(bouncer_batch_id, emails, check_type);
     await db_recordRateLimit(check_type, 'create_batch');
     
     // Rate limit check before next iteration
     const canContinue = await db_checkRateLimit(check_type, 'create_batch');
     if (!canContinue) break; // Approaching rate limit, stop creating more
   }
   ```
4. **Early Exit Conditions**:
   - Break if no more emails available for processing
   - Break if approaching rate limit (200/min with 180 buffer)
   - Continue with next batch if individual API call fails (log error)

#### MULTI-BATCH GREEDY LOGIC
```javascript
// Example: Available capacity = 3 batches, Pending emails = 50k
// Batch 1: John(5k) + Alice(2k) + Bob(3k) = 10k bouncer batch
// Batch 2: Bob(3k remaining) + Carol(7k) = 10k bouncer batch  
// Batch 3: Dave(10k) = 10k bouncer batch
// Result: 30k emails processed in single 5-second cycle
// Remaining: 20k emails wait for next cycle
```

#### Error Handling
- Log all errors but continue processing
- Failed bouncer batch creation leaves user batches as 'queued' for retry
- Do NOT retry failed batch creation attempts in same cycle

### Status Checker Worker (`backend/queue/workers/status_checker_worker.js`)

#### Job Responsibility
- Monitors ALL outstanding bouncer batches (not scheduled per-batch)
- Downloads results immediately when batch completes
- **Fire-and-forget** approach for result downloading

#### Process Flow (SIMPLIFIED)
1. **Get Outstanding Batches**: Call `db_getOutstandingBouncerBatches(check_type)`
   - Returns all bouncer_batch_ids with status 'processing'
2. **Check Each Status**: Call `BouncerAPI.checkDeliverabilityBatch()` or `checkCatchallBatch()`
3. **Rate Limit**: Call `db_recordRateLimit(check_type, 'check_status')` for each call
4. **If Completed**: Immediately fire-and-forget download results
   - Call `BouncerAPI.getDeliverabilityResults()` or `getCatchallResults()`
   - Call `db_processBouncerResults(bouncer_batch_id, results, check_type)`
   - Call `db_recordRateLimit(check_type, 'download_results')`
5. **If Failed**: Call `db_markBouncerBatchFailed(bouncer_batch_id, check_type)`

#### Result Processing Logic (FIRE-AND-FORGET)
- **Strip Emails**: Use `stripEmailModifiers()` from `backend/utils/processEmails.js`
- **Find Global IDs**: Map stripped emails to `email_global_id` via `Emails_Global` table
- **Update Global Results**: Insert/update `Email_Deliverable_Results` or `Email_Catchall_Results`
- **Complete User Batches**: Mark user batches as 'completed' when ALL their emails are processed
- **No waiting, no scheduling** - process immediately when detected

## 4. Job Scheduling (SIMPLIFIED)

### Only 2 Repeating Jobs
```javascript
// Batch Creator - Every 5 seconds
queue.add('greedy_batch_creator_deliverable', { check_type: 'deliverable' }, {
  repeat: { every: 5000 },
  jobId: 'batch_creator_deliverable' // Prevent duplicates
});

queue.add('greedy_batch_creator_catchall', { check_type: 'catchall' }, {
  repeat: { every: 5000 },
  jobId: 'batch_creator_catchall'
});

// Status Checker - Every 30 seconds
queue.add('status_checker_deliverable', { check_type: 'deliverable' }, {
  repeat: { every: 30000 },
  jobId: 'status_checker_deliverable'
});

queue.add('status_checker_catchall', { check_type: 'catchall' }, {
  repeat: { every: 30000 },
  jobId: 'status_checker_catchall'
});
```

### No Priority System Needed
- All jobs have equal priority
- Simple FIFO processing

## 5. Rate Limiting Integration (SIMPLIFIED)

### API Request Tracking
- Track ALL bouncer API calls in `Rate_Limit_Tracker` table
- Check limits before each API call: `db_checkRateLimit(verification_type, request_type)`
- Respect 200 req/min limit with 180 request buffer
- Skip processing cycle if rate limit reached

### Rate Limit Logic (SIMPLIFIED)
```javascript
const canMakeRequest = await db_checkRateLimit('deliverable', 'create_batch');
if (!canMakeRequest) {
  console.log('Rate limit reached, skipping batch creation cycle');
  return; // Skip this cycle, try again in 5 seconds
}
```

## 6. Error Handling (SIMPLIFIED)

### No Retry Policy
- Failed bouncer API calls are logged but not retried
- User batches remain in 'queued' status for next cycle attempt
- Failed bouncer batches mark ALL associated user batches as 'failed'

### Graceful Shutdown
- Listen for SIGTERM/SIGINT signals
- Close all workers gracefully
- Wait for current jobs to complete before exit

## 7. Integration Points (MINIMAL CHANGES)

### Controller Integration (MINIMAL)
- **NO CHANGES** to batch creation flow at controller.js:117
- Queue operates **completely independently**
- User batches created normally via existing `db_createBatch()` function

### Database Integration
- Use `funs_db_queue.js` for all queue-specific database operations
- **NO CHANGES** to existing `funs_db.js` functions
- Queue functions operate on existing schema via new functions

### Startup Integration (SIMPLE)
```javascript
// In main app startup
const queueManager = require('./backend/queue/queue_manager');
await queueManager.initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await queueManager.shutdown();
  process.exit(0);
});
```

## 8. Configuration (MINIMAL)

### Queue Configuration
```javascript
const queueConfig = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,  // Keep minimal completed jobs
    removeOnFail: 10,      // Keep minimal failed jobs
    attempts: 1,           // NO retries
  }
};
```

### Worker Configuration  
```javascript
const workerConfig = {
  connection: redisConnection,
  concurrency: 1,        // Simple single-threaded processing
  stalledInterval: 30000,
  maxStalledCount: 1
};
```

## 9. Key Architectural Principles

### Complete Independence
- Queue system **never triggers** user batch creation
- User batch creation **never triggers** queue jobs
- Queue only reads/updates existing database state

### Greedy Processing
- Every 5 seconds, greedily collect up to 10k emails across multiple user batches
- Split user batches as needed to optimize bouncer batch size
- Process oldest user requests first (FIFO by created_ts)

### Fire-and-Forget
- Status checking and result downloading happen in single job
- No complex scheduling between job types
- Simple, predictable processing flow