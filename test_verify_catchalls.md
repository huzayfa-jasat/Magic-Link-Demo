# Test Plan for Verify Catchalls Feature

## Frontend Changes
1. **Added "Verify Catchalls" button** in `frontend/src/app/Emails/BatchDetails.jsx`
   - Only shows for deliverability batches when `details.stats.catchall > 0`
   - Makes POST request to `/api/batches/deliverable/batch/${id}/verify-catchalls`
   - On success, navigates to the new catchall batch page

2. **Added button styling** in `frontend/src/app/Emails/styles/Emails.module.css`
   - `.verifyCatchallsBtn` class with hover effect

## Backend Changes

### Route (`backend/routes/batches/routes.js`)
- Added new POST endpoint: `/deliverable/batch/:batchId/verify-catchalls`
- Uses existing `checkUserBatchAccess` middleware for authorization

### Controller (`backend/routes/batches/controller.js`)
- Added `verifyCatchalls` function that:
  - Gets user_id from request
  - Calls `db_createCatchallBatchFromDeliverable`
  - Returns new batch ID in response

### Database Function (`backend/routes/batches/funs_db.js`)
- Added `db_createCatchallBatchFromDeliverable` function that:
  1. Verifies the original batch exists and is completed
  2. Finds all emails marked as catchall (`is_catchall = 1`)
  3. Creates new catchall batch with title "{original} - Catchall Verification"
  4. Copies S3 metadata (preferring catchall_only export if available)
  5. Adds all catchall emails to the new batch
  6. Sets batch status to 'processing' to start automatically

## Testing Steps

### Manual Testing
1. Find or create a deliverability batch that has completed and contains catchall results
2. Navigate to the batch details page
3. Verify the "Verify Catchalls" button appears
4. Click the button
5. Confirm:
   - New catchall batch is created
   - User is redirected to the new batch page
   - The new batch contains only the catchall emails from the original batch

### API Testing
```bash
# Test the endpoint directly (replace with actual values)
curl -X POST http://localhost:3001/api/batches/deliverable/batch/{batchId}/verify-catchalls \
  -H "Content-Type: application/json" \
  -H "Cookie: {session_cookie}"
```

### Database Verification
```sql
-- Check if catchall batch was created correctly
SELECT * FROM Batches_Catchall 
WHERE title LIKE '%Catchall Verification%' 
ORDER BY created_ts DESC LIMIT 1;

-- Verify emails were copied
SELECT COUNT(*) FROM Batch_Emails_Catchall 
WHERE batch_id = {new_batch_id};
```

## Edge Cases Handled
- Original batch not found or not completed
- No catchall emails in original batch
- Missing S3 metadata (falls back to original file)
- User authorization checks