# Database Operations Implementation Plan - funs_db_queue.js - CORRECTED

## Overview
Create `backend/routes/v2_batches/funs_db_queue.js` modeled after existing `funs_db.js` structure. Provides database operations for **GREEDY** queue system that combines multiple user batches into optimal 10k bouncer batches. Follows KISS principles with minimal functions.

## File Structure & Dependencies

### File Location
`backend/routes/v2_batches/funs_db_queue.js`

### Dependencies (Mirror funs_db.js)
```javascript
// Dependencies
const knex = require('knex')(require('../../knexfile.js').development);
const { stripEmailModifiers } = require('../../utils/processEmails.js');
```

### Helper Functions (Mirror existing patterns from funs_db.js)
```javascript
// Helper Functions
const getBatchTableName = (check_type) => {
    return check_type === 'deliverable' ? 'Batches_Deliverable' : 'Batches_Catchall';
}
const getResultsTableName = (check_type) => {
    return check_type === 'deliverable' ? 'Email_Deliverable_Results' : 'Email_Catchall_Results';
}
const getBouncerEmailTableName = (check_type) => {
    return check_type === 'deliverable' ? 'Bouncer_Batch_Emails_Deliverable' : 'Bouncer_Batch_Emails_Catchall';
}
const getBatchEmailAssociationTableName = (check_type) => {
    return check_type === 'deliverable' ? 'Batch_Emails_Deliverable' : 'Batch_Emails_Catchall';
}
```

## 1. Greedy Batch Creation Functions (CORRECTED APPROACH)

### db_getOutstandingBouncerBatchCount(check_type)
**Purpose**: Count current outstanding bouncer batches and return available capacity for multi-batch creation
**Returns**: `[success, current_count, available_capacity]`

**Implementation Details**:
- Count distinct `bouncer_batch_id` where `status = 'processing'` AND `bouncer_batch_id IS NOT NULL`
- Calculate `available_capacity = Math.max(0, 15 - current_count)`
- Return both current count and available slots for immediate multi-batch processing

**SQL Pattern**:
```sql
SELECT COUNT(DISTINCT bouncer_batch_id) as count
FROM Batches_Deliverable 
WHERE status = 'processing' 
  AND bouncer_batch_id IS NOT NULL
```

**Referenced Tables**:
- `Batches_Deliverable` (line 44 in db/queue_schemas.sql)
- `Batches_Catchall` (line 61 in db/queue_schemas.sql)

### db_getEmailsForGreedyBatch(check_type, max_emails=10000)
**Purpose**: **GREEDILY** collect up to 10k emails from multiple user batches, ordered by timestamp (FIFO), with user batch splitting support
**Returns**: `[success, emails_data]` where emails_data contains `{email_global_id, email_stripped, user_batch_id, user_batch_remaining_count}`

**Implementation Details**:
1. **Find Pending User Batches**: Get user batches with `bouncer_batch_id IS NULL` AND `new_verifications > 0`
2. **Order by FIFO**: `ORDER BY created_ts ASC` (earliest requests first)
3. **Greedy Collection**: Collect emails across batches until 10k limit reached
4. **User Batch Splitting**: If user batch has more emails than remaining capacity, split it

**Complex SQL with Joining**:
```sql
SELECT 
    eg.global_id as email_global_id,
    eg.email_stripped,
    bed.batch_id as user_batch_id,
    bd.new_verifications as user_batch_total,
    bd.created_ts
FROM Batch_Emails_Deliverable bed
JOIN Emails_Global eg ON bed.email_global_id = eg.global_id  
JOIN Batches_Deliverable bd ON bed.batch_id = bd.id
WHERE bd.bouncer_batch_id IS NULL 
  AND bd.new_verifications > 0
  AND bd.status = 'queued'
  AND bed.used_cached = 0
ORDER BY bd.created_ts ASC, bed.email_global_id ASC
LIMIT ?
```

**Processing Logic**:
- Collect emails from each user batch in timestamp order
- Track `remaining_capacity` and stop at 10k total
- Return metadata about which user batches were fully/partially processed

**Referenced Tables**:
- `Batches_Deliverable`/`Batches_Catchall` (lines 40-72 in db/queue_schemas.sql)
- `Batch_Emails_Deliverable`/`Batch_Emails_Catchall` (lines 75-93 in db/queue_schemas.sql) 
- `Emails_Global` (lines 4-10 in db/queue_schemas.sql)

### db_assignBouncerBatchId(bouncer_batch_id, batch_assignments, check_type)
**Purpose**: Assign bouncer_batch_id to multiple user batches and create email tracking
**Returns**: `[success, affected_user_batches_count]`
**Parameters**: `batch_assignments = [{user_batch_id, email_global_ids, is_partial}]`

**Implementation Details** (Use knex transaction):
1. **Update User Batches**: Set `bouncer_batch_id` and `status = 'processing'`
   ```sql
   UPDATE Batches_Deliverable 
   SET bouncer_batch_id = ?, status = 'processing'
   WHERE id IN (?)
   ```

2. **Create Email Tracking**: Insert into `Bouncer_Batch_Emails_*` for result mapping
   ```sql
   INSERT INTO Bouncer_Batch_Emails_Deliverable 
   (bouncer_batch_id, email_global_id, user_batch_id) 
   VALUES (?, ?, ?)
   ```

3. **Handle Partial Batches**: For split user batches, update `new_verifications` count
   ```sql
   UPDATE Batches_Deliverable 
   SET new_verifications = new_verifications - ? 
   WHERE id = ? AND new_verifications > 0
   ```

**Referenced Tables**:
- `Batches_Deliverable`/`Batches_Catchall` (lines 40-72 in db/queue_schemas.sql)
- `Bouncer_Batch_Emails_Deliverable`/`Bouncer_Batch_Emails_Catchall` (lines 60-84 in internal_queue_schemas.sql)

## 2. Status Check Functions (SIMPLIFIED)

### db_getOutstandingBouncerBatches(check_type)
**Purpose**: Get ALL bouncer_batch_ids that need status checking
**Returns**: `[success, bouncer_batch_ids_array]`

**Implementation Details**:
```sql
SELECT DISTINCT bouncer_batch_id 
FROM Batches_Deliverable 
WHERE status = 'processing' 
  AND bouncer_batch_id IS NOT NULL
```

### db_markBouncerBatchFailed(bouncer_batch_id, check_type)
**Purpose**: Mark ALL user batches with this bouncer_batch_id as failed
**Returns**: `[success, affected_count]`

**Implementation Details**:
```sql
UPDATE Batches_Deliverable 
SET status = 'failed' 
WHERE bouncer_batch_id = ?
```

## 3. Result Processing Functions (FIRE-AND-FORGET)

### db_processBouncerResults(bouncer_batch_id, results_array, check_type)
**Purpose**: Process bouncer results using email stripping, update global results, complete user batches
**Returns**: `[success, processed_count]`

**Implementation Details** (Use knex transaction):

1. **Process Each Email Result**:
   - **Strip Email**: Use `stripEmailModifiers(result.email)` from utils/processEmails.js
   - **Find Global ID**: Query `Emails_Global` using stripped email
   - **Find User Batch**: Query `Bouncer_Batch_Emails_*` using bouncer_batch_id + email_global_id

2. **Update Global Results**: Insert/Update single global result per email
   ```sql
   -- For Deliverable
   INSERT INTO Email_Deliverable_Results 
   (email_global_id, email_nominal, status, reason, is_catchall, score) 
   VALUES (?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE 
   status = VALUES(status), 
   reason = VALUES(reason),
   is_catchall = VALUES(is_catchall),
   score = VALUES(score),
   updated_ts = NOW()
   
   -- For Catchall  
   INSERT INTO Email_Catchall_Results 
   (email_global_id, email_nominal, toxicity) 
   VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE 
   toxicity = VALUES(toxicity),
   updated_ts = NOW()
   ```

3. **Mark Emails as Processed**: Update batch email associations
   ```sql
   UPDATE Batch_Emails_Deliverable bed
   JOIN Bouncer_Batch_Emails_Deliverable bbed ON bed.email_global_id = bbed.email_global_id
   SET bed.used_cached = 0  -- Mark as newly verified (not cached)
   WHERE bbed.bouncer_batch_id = ?
   ```

4. **Complete User Batches**: Mark user batches as completed when ALL their emails are processed
   ```sql
   -- Check if user batch has all emails processed
   UPDATE Batches_Deliverable bd
   SET status = 'completed', completed_ts = NOW()
   WHERE bd.bouncer_batch_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM Batch_Emails_Deliverable bed 
       WHERE bed.batch_id = bd.id AND bed.used_cached = 1
     )
   ```

**Email Processing Logic**:
```javascript
// For each email result from bouncer
const strippedEmail = stripEmailModifiers(result.email);
const globalId = await getGlobalIdByStrippedEmail(strippedEmail);
const userBatchId = await getUserBatchIdByGlobalId(bouncer_batch_id, globalId);
```

**Referenced Tables**:
- `Email_Deliverable_Results` (lines 13-25 in db/queue_schemas.sql)
- `Email_Catchall_Results` (lines 27-37 in db/queue_schemas.sql)
- `Bouncer_Batch_Emails_*` (lines 60-84 in internal_queue_schemas.sql)
- `Batch_Emails_*` (lines 75-93 in db/queue_schemas.sql)

## 4. Rate Limiting Functions (UNCHANGED)

### db_checkRateLimit(verification_type, request_type, buffer_requests=180)
**Purpose**: Check if we can make API request without exceeding rate limits (200/min - 180 buffer = 20 safety margin)
**Returns**: `[success, can_make_request, current_count]`

**Implementation Details**:
```sql
SELECT SUM(request_count) as total_requests 
FROM Rate_Limit_Tracker 
WHERE verification_type = ? 
  AND request_type = ? 
  AND window_start >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
```

**Logic**: `can_make_request = (current_count + 1 <= 20)` (using 180 buffer)

**Referenced Tables**:
- `Rate_Limit_Tracker` (lines 87-95 in internal_queue_schemas.sql)

### db_recordRateLimit(verification_type, request_type, request_count=1)
**Purpose**: Record API request for rate limiting tracking
**Returns**: `[success]`

**Implementation Details**:
```sql
INSERT INTO Rate_Limit_Tracker 
(verification_type, request_type, request_count, window_start) 
VALUES (?, ?, ?, NOW())
```

## 5. Helper Functions (SIMPLIFIED)

### db_getGlobalIdByStrippedEmail(email_stripped)
**Purpose**: Get global_id for stripped email (used in result processing)
**Returns**: `[success, global_id]`

**Implementation Details**:
```sql
SELECT global_id 
FROM Emails_Global 
WHERE email_stripped = ?
```

### db_getUserBatchIdByGlobalId(bouncer_batch_id, email_global_id, check_type)
**Purpose**: Get user_batch_id for email in specific bouncer batch (used in result processing)  
**Returns**: `[success, user_batch_id]`

**Implementation Details**:
```sql
SELECT user_batch_id 
FROM Bouncer_Batch_Emails_Deliverable 
WHERE bouncer_batch_id = ? AND email_global_id = ?
```

## 6. Error Handling & Patterns (Mirror funs_db.js)

### Error Handling Pattern (UNCHANGED)
```javascript
async function db_functionName(params) {
    let err_code;
    const result = await knex(table_name)
        .query_operations()
        .catch((err) => {if (err) err_code = err.code});
    
    if (err_code) return [false, null];
    return [true, result];
}
```

### Transaction Pattern (UNCHANGED)
```javascript
async function db_transactionalFunction(params) {
    const trx = await knex.transaction();
    try {
        // Multiple operations
        await trx(table1).insert(data1);
        await trx(table2).update(data2);
        
        await trx.commit();
        return [true, result];
    } catch (err) {
        await trx.rollback();
        return [false, null];
    }
}
```

## 7. Exports Structure (SIMPLIFIED)

```javascript
// Exports
module.exports = {
    // Greedy Batch Creation
    db_getOutstandingBouncerBatchCount,
    db_getEmailsForGreedyBatch,
    db_assignBouncerBatchId,
    
    // Status Checks (Simplified)
    db_getOutstandingBouncerBatches,
    db_markBouncerBatchFailed,
    
    // Result Processing (Fire-and-Forget)
    db_processBouncerResults,
    
    // Rate Limiting
    db_checkRateLimit,
    db_recordRateLimit,
    
    // Helper Functions
    db_getGlobalIdByStrippedEmail,
    db_getUserBatchIdByGlobalId
};
```

## 8. Integration Notes

### Key Differences from Original Plan
1. **Greedy Collection**: `db_getEmailsForGreedyBatch()` replaces per-user-batch functions
2. **User Batch Splitting**: Support for partial processing of large user batches
3. **Email Stripping**: Built-in support for nominal → stripped email conversion
4. **Fire-and-Forget**: Single function handles result processing and user batch completion
5. **Simplified Exports**: Only 9 functions instead of 16

### Connection to Existing Code
- Use same knex configuration from existing `funs_db.js`
- Follow same error handling patterns: `[success_boolean, data]`
- Use same helper function patterns for table name resolution
- Import `stripEmailModifiers` from existing utils

### Performance Considerations
- Complex JOIN queries for greedy email collection - ensure proper indexing
- Transaction-based processing for consistency
- Efficient batch operations for large email sets
- Rate limiting checks before expensive operations

### Testing Requirements
- Test greedy collection with multiple user batches
- Test user batch splitting edge cases
- Test email stripping and global ID mapping
- Validate transaction rollback on errors
- Test rate limiting boundary conditions