-- Add 'processed' column to Bouncer_Batches_Deliverable table
-- This tracks the number of emails already processed by the bouncer API
ALTER TABLE Bouncer_Batches_Deliverable 
ADD COLUMN `processed` int NOT NULL DEFAULT 0 AFTER `email_count`;

-- Add index for efficient queries on processed status
ALTER TABLE Bouncer_Batches_Deliverable 
ADD INDEX idx_processing_progress (`user_batch_id`, `status`, `processed`);