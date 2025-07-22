# Bouncer Queue System

A BullMQ-based queue system that greedily creates bouncer batches, monitors their status, and processes results with optimal throughput.

## Architecture

- **Complete Independence**: Queue operates separately from user batch creation
- **Multi-Batch Greedy**: Creates up to 15 concurrent 10k bouncer batches 
- **Fire-and-Forget**: Immediate result processing when batches complete
- **KISS Principles**: Simple, predictable, maintainable code

## Terminology
- A "user batch" is a collection of emails submitted by a user that want to get verified (either verifying "deliverability" or "catchall"). This is akin to a "request", or a CSV import.
- A "bouncer batch" / "internal batch" / "queue batch" is a collection of at most 10k emails, from any number of "user batches", that are verified together by Bouncer. This "bouncer batch" / "internal batch" / "queue batch" corresponds to exactly one bouncer API request.

## Components

### 1. Queue Manager (`queue_manager.js`)
- Redis connection and configuration
- Job scheduling (batch creator every 5s, status checker every 30s)
- Graceful shutdown handling

### 2. Batch Creator Worker (`workers/batch_creator_worker.js`)
- Multi-batch greedy logic
- Combines multiple user batches into optimal 10k bouncer batches
- Respects rate limits and capacity constraints

### 3. Status Checker Worker (`workers/status_checker_worker.js`)  
- Monitors all outstanding bouncer batches
- Fire-and-forget result downloading and processing
- Automatic failure handling

## Queue Flow

### User Batch Creation (Existing - No Changes)
1. Users create "user batches" via existing API → `bouncer_batch_id = NULL`, `status = 'queued'`

### Queue Processing (New - Automatic)
1. **Every 5 seconds**: Batch creator greedily collects emails across user batches
2. **Multi-batch creation**: Creates multiple 10k bouncer batches if capacity allows
3. **Every 30 seconds**: Status checker monitors all outstanding bouncer batches  
4. **Immediate processing**: Downloads and processes results when batches complete

### Example Timeline
```
T+0s:  John(5k), Alice(2k), Bob(6k) create user batches (in that chronological order)
T+2s:  Capacity for 20k more emails is made available (previous jobs have finished)
T+5s:  Queue creates: Batch1[John(5k)+Alice(2k)+Bob(3k)], Batch2[Bob(3k remaining)]
T+30s: Queue checks status of both batches
T+50s: Batch2 completes → immediate result download and processing  
T+60s: Batch1 completes → immediate result download and processing
T+65s: John, Alice, Bob see completed results in their user batches
```

## Monitoring

```javascript
const { getQueueStatus } = require('./backend/queue');

// Get current status
const status = await getQueueStatus();
console.log(status);
// Output: { waiting: 0, active: 4, completed: 123, failed: 2, workers: 2 }
```

## Requirements

- **Redis**: BullMQ requires Redis for job storage
- **Database**: Uses existing `funs_db_queue.js` functions (to be implemented)
- **Bouncer API**: Uses existing `bouncer.js` client

## Error Handling

- **No Retries**: Failed jobs stay failed (as per requirements)
- **Individual Resilience**: Single batch failures don't stop other processing
- **Rate Limiting**: Automatic compliance with 200 req/min limits
- **Graceful Degradation**: System continues even with partial failures

## Job Types

1. **greedy_batch_creator_deliverable** - Creates deliverability bouncer batches
2. **greedy_batch_creator_catchall** - Creates catchall bouncer batches  
3. **status_checker_deliverable** - Monitors deliverability batch status
4. **status_checker_catchall** - Monitors catchall batch status

All jobs repeat automatically with no manual intervention required.