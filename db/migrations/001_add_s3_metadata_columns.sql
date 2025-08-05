-- Migration: Add s3_metadata columns for S3 enrichment feature
-- Date: 2025-08-04

-- Add s3_metadata column to Batches_Deliverable table
ALTER TABLE Batches_Deliverable ADD COLUMN s3_metadata JSON;

-- Add s3_metadata column to Batches_Catchall table
ALTER TABLE Batches_Catchall ADD COLUMN s3_metadata JSON;

-- Create S3_Enrichment_Progress table for tracking enrichment status
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
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE KEY unique_batch_progress (batch_id, check_type)
);

-- Add index for faster lookups
CREATE INDEX idx_s3_enrichment_batch ON S3_Enrichment_Progress(batch_id, check_type);
CREATE INDEX idx_s3_enrichment_status ON S3_Enrichment_Progress(status);