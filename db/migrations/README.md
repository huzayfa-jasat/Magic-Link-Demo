# Database Migrations

## Applying the Batch Tracking Migration

To enable batch name tracking in credit history, run the following SQL migration:

```bash
# Connect to your MySQL database
mysql -u your_username -p your_database < add_batch_tracking_to_credits.sql
```

This migration adds:
- `batch_id` column to track which batch consumed credits
- `batch_type` column to distinguish between deliverable and catchall batches
- Index for efficient lookups

After applying this migration, credit usage history will display the batch name instead of generic "Verified Emails" text.

Note: The migration is safe to run on existing data as the new columns allow NULL values for historical records.