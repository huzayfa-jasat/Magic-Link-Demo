-- Add batch tracking columns to credit history tables
-- This allows tracking which batch consumed which credits

-- Add columns to Users_Credit_Balance_History
ALTER TABLE Users_Credit_Balance_History 
ADD COLUMN batch_id INT DEFAULT NULL AFTER event_typ,
ADD COLUMN batch_type ENUM('deliverable', 'catchall') DEFAULT NULL AFTER batch_id,
ADD INDEX idx_batch_lookup (batch_id, batch_type);

-- Add columns to Users_Catchall_Credit_Balance_History  
ALTER TABLE Users_Catchall_Credit_Balance_History
ADD COLUMN batch_id INT DEFAULT NULL AFTER event_typ,
ADD COLUMN batch_type ENUM('deliverable', 'catchall') DEFAULT NULL AFTER batch_id,
ADD INDEX idx_batch_lookup (batch_id, batch_type);

-- Note: We don't add foreign keys because:
-- 1. batch_id can reference either Batches_Deliverable or Batches_Catchall based on batch_type
-- 2. Historical records should remain even if batches are deleted
-- 3. NULL values are allowed for non-usage events (purchase, refer_reward, signup)