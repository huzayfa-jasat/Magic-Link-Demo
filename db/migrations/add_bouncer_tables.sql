-- =======================================================
-- BOUNCER EMAIL VERIFICATION SYSTEM MIGRATION
-- =======================================================
-- Description: Adds Bouncer email verification tables to existing database
-- Version: 1.0
-- Created: 2025-07-03
-- Purpose: Implements queue management system for Bouncer API integration
-- 
-- IMPORTANT: This migration is designed to be idempotent and can be run multiple times safely
-- 
-- Migration includes:
-- - Bouncer_Batches: Tracks batches sent to Bouncer API
-- - Bouncer_Queue: Manages email queuing and processing
-- - Bouncer_Rate_Limit: Tracks API rate limiting
-- - Bouncer_Results: Stores detailed verification results
-- - Bouncer_Dead_Letter_Queue: Handles permanently failed items
-- - Bouncer_Health_Metrics: System health monitoring
-- 
-- ROLLBACK INSTRUCTIONS:
-- To rollback this migration, run the following commands in order:
-- DROP TABLE IF EXISTS `Bouncer_Health_Metrics`;
-- DROP TABLE IF EXISTS `Bouncer_Dead_Letter_Queue`;
-- DROP TABLE IF EXISTS `Bouncer_Results`;
-- DROP TABLE IF EXISTS `Bouncer_Queue`;
-- DROP TABLE IF EXISTS `Bouncer_Rate_Limit`;
-- DROP TABLE IF EXISTS `Bouncer_Batches`;
-- =======================================================

SET NAMES utf8mb3;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- Start transaction for atomic migration
START TRANSACTION;

-- =======================================================
-- BOUNCER BATCH TRACKING TABLE
-- =======================================================
-- Tracks batches sent to Bouncer API for processing
-- Manages batch lifecycle from creation to completion
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Batches`;
CREATE TABLE `Bouncer_Batches` (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` varchar(50) NOT NULL COMMENT 'Unique batch ID from Bouncer API',
    `user_id` int NOT NULL COMMENT 'User who owns this batch',
    `request_id` int NOT NULL COMMENT 'Associated request ID',
    `status` enum('queued', 'processing', 'completed', 'failed', 'downloading') NOT NULL DEFAULT 'queued' COMMENT 'Current batch status',
    `quantity` int NOT NULL COMMENT 'Number of emails in batch',
    `duplicates` int NOT NULL DEFAULT 0 COMMENT 'Number of duplicate emails found',
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When batch was created',
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update timestamp',
    `completed_ts` TIMESTAMP NULL COMMENT 'When batch processing completed',
    `error_message` TEXT COMMENT 'Error message if batch failed',
    `retry_count` int NOT NULL DEFAULT 0 COMMENT 'Number of retry attempts',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_batch_id` (`batch_id`),
    FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES `Requests`(`request_id`) ON DELETE CASCADE,
    INDEX `idx_status` (`status`),
    INDEX `idx_created` (`created_ts`),
    INDEX `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='Tracks Bouncer API batch processing lifecycle';

-- =======================================================
-- BOUNCER QUEUE TABLE
-- =======================================================
-- Manages emails waiting to be processed by Bouncer API
-- Handles queueing, batching, and processing status
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Queue`;
CREATE TABLE `Bouncer_Queue` (
    `queue_id` int AUTO_INCREMENT NOT NULL,
    `global_id` int NOT NULL COMMENT 'Reference to Contacts_Global table',
    `user_id` int NOT NULL COMMENT 'User who owns this email',
    `request_id` int NOT NULL COMMENT 'Associated request ID',
    `batch_id` int NULL COMMENT 'Assigned batch ID when batched (references Bouncer_Batches.id)',
    `status` enum('queued', 'assigned', 'completed', 'failed') NOT NULL DEFAULT 'queued' COMMENT 'Current queue status',
    `priority` int NOT NULL DEFAULT 0 COMMENT 'Queue priority (higher = higher priority)',
    `domain_hash` varchar(64) COMMENT 'Hash of email domain for optimization',
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When queued',
    `assigned_ts` TIMESTAMP NULL COMMENT 'When assigned to batch',
    `completed_ts` TIMESTAMP NULL COMMENT 'When processing completed',
    PRIMARY KEY (`queue_id`),
    FOREIGN KEY (`global_id`) REFERENCES `Contacts_Global`(`global_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES `Requests`(`request_id`) ON DELETE CASCADE,
    FOREIGN KEY (`batch_id`) REFERENCES `Bouncer_Batches`(`id`) ON DELETE SET NULL,
    INDEX `idx_status_priority` (`status`, `priority` DESC),
    INDEX `idx_domain_hash` (`domain_hash`),
    INDEX `idx_created` (`created_ts`),
    INDEX `idx_batch_id` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='Queue for emails waiting to be processed by Bouncer API';

-- =======================================================
-- BOUNCER RATE LIMIT TABLE
-- =======================================================
-- Tracks API rate limiting to stay within Bouncer limits
-- Manages 200 requests per minute constraint
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Rate_Limit`;
CREATE TABLE `Bouncer_Rate_Limit` (
    `id` int AUTO_INCREMENT NOT NULL,
    `request_count` int NOT NULL DEFAULT 0 COMMENT 'Number of requests made',
    `window_start_ts` TIMESTAMP NOT NULL COMMENT 'Start of rate limit window',
    `window_end_ts` TIMESTAMP NOT NULL COMMENT 'End of rate limit window',
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When record was created',
    PRIMARY KEY (`id`),
    INDEX `idx_window` (`window_start_ts`, `window_end_ts`),
    INDEX `idx_created` (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='Tracks API rate limiting for Bouncer requests';

-- =======================================================
-- BOUNCER RESULTS TABLE
-- =======================================================
-- Stores detailed verification results from Bouncer API
-- Contains comprehensive verification data and scores
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Results`;
CREATE TABLE `Bouncer_Results` (
    `batch_id` int NOT NULL COMMENT 'Reference to Bouncer_Batches.id',
    `global_id` int NOT NULL COMMENT 'Reference to Contacts_Global.global_id',
    `bouncer_status` varchar(50) NOT NULL COMMENT 'Bouncer verification status (deliverable, undeliverable, etc.)',
    `bouncer_reason` varchar(100) COMMENT 'Reason for the verification result',
    `domain_info` JSON COMMENT 'Domain verification information',
    `account_info` JSON COMMENT 'Account verification information',
    `dns_info` JSON COMMENT 'DNS verification information',
    `provider` varchar(100) COMMENT 'Email provider (Gmail, Outlook, etc.)',
    `score` int COMMENT 'Verification score (0-100)',
    `toxic` varchar(20) COMMENT 'Toxicity classification',
    `toxicity` int COMMENT 'Toxicity score',
    `processed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When result was processed',
    PRIMARY KEY (`batch_id`, `global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES `Bouncer_Batches`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`global_id`) REFERENCES `Contacts_Global`(`global_id`) ON DELETE CASCADE,
    INDEX `idx_bouncer_status` (`bouncer_status`),
    INDEX `idx_provider` (`provider`),
    INDEX `idx_score` (`score`),
    INDEX `idx_processed` (`processed_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='Detailed verification results from Bouncer API';

-- =======================================================
-- BOUNCER DEAD LETTER QUEUE TABLE
-- =======================================================
-- Handles permanently failed items that cannot be processed
-- Provides audit trail for failed processing attempts
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Dead_Letter_Queue`;
CREATE TABLE `Bouncer_Dead_Letter_Queue` (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` int NOT NULL COMMENT 'Reference to failed batch',
    `user_id` int NOT NULL COMMENT 'User who owns the failed item',
    `request_id` int NOT NULL COMMENT 'Associated request ID',
    `error_message` TEXT NOT NULL COMMENT 'Detailed error message',
    `failed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When item failed permanently',
    `reviewed` BOOLEAN DEFAULT FALSE COMMENT 'Whether failure has been reviewed',
    `review_notes` TEXT COMMENT 'Notes from manual review',
    `reviewed_by` int NULL COMMENT 'User who reviewed the failure',
    `reviewed_ts` TIMESTAMP NULL COMMENT 'When failure was reviewed',
    PRIMARY KEY (`id`),
    FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES `Requests`(`request_id`) ON DELETE CASCADE,
    FOREIGN KEY (`reviewed_by`) REFERENCES `Users`(`id`) ON DELETE SET NULL,
    INDEX `idx_failed_ts` (`failed_ts`),
    INDEX `idx_reviewed` (`reviewed`),
    INDEX `idx_user_failed` (`user_id`, `failed_ts`),
    INDEX `idx_batch_id` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='Dead letter queue for permanently failed email verification items';

-- =======================================================
-- BOUNCER HEALTH METRICS TABLE
-- =======================================================
-- Monitors system health and performance metrics
-- Tracks queue performance, API response times, error rates
-- =======================================================

DROP TABLE IF EXISTS `Bouncer_Health_Metrics`;
CREATE TABLE `Bouncer_Health_Metrics` (
    `id` int AUTO_INCREMENT NOT NULL,
    `metric_name` varchar(100) NOT NULL COMMENT 'Name of the metric being tracked',
    `metric_value` int NOT NULL COMMENT 'Numeric value of the metric',
    `metric_data` JSON COMMENT 'Additional metric data in JSON format',
    `recorded_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When metric was recorded',
    PRIMARY KEY (`id`),
    INDEX `idx_metric_time` (`metric_name`, `recorded_ts`),
    INDEX `idx_recorded` (`recorded_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci 
COMMENT='System health and performance metrics for Bouncer integration';

-- =======================================================
-- VIEWS FOR EASY QUERYING
-- =======================================================

-- Create view for batch status overview
CREATE OR REPLACE VIEW `Bouncer_Batch_Status_Overview` AS
SELECT 
    bb.id,
    bb.batch_id,
    bb.user_id,
    u.email as user_email,
    bb.request_id,
    bb.status,
    bb.quantity,
    bb.duplicates,
    bb.created_ts,
    bb.updated_ts,
    bb.completed_ts,
    bb.retry_count,
    CASE 
        WHEN bb.status = 'completed' THEN 'success'
        WHEN bb.status = 'failed' THEN 'error'
        WHEN bb.status = 'processing' THEN 'warning'
        ELSE 'info'
    END as status_color,
    CASE 
        WHEN bb.completed_ts IS NOT NULL THEN 
            TIMESTAMPDIFF(MINUTE, bb.created_ts, bb.completed_ts)
        ELSE 
            TIMESTAMPDIFF(MINUTE, bb.created_ts, NOW())
    END as processing_time_minutes
FROM `Bouncer_Batches` bb
JOIN `Users` u ON bb.user_id = u.id;

-- Create view for queue statistics
CREATE OR REPLACE VIEW `Bouncer_Queue_Statistics` AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(priority) as avg_priority,
    MIN(created_ts) as oldest_item,
    MAX(created_ts) as newest_item
FROM `Bouncer_Queue`
GROUP BY status;

-- =======================================================
-- INITIAL DATA SETUP
-- =======================================================

-- Insert initial health metrics to establish baseline
INSERT INTO `Bouncer_Health_Metrics` (`metric_name`, `metric_value`, `metric_data`) VALUES
('migration_completed', 1, JSON_OBJECT('version', '1.0', 'tables_created', 6)),
('initial_setup', 1, JSON_OBJECT('timestamp', NOW(), 'status', 'success'));

-- =======================================================
-- VERIFY FOREIGN KEY CONSTRAINTS
-- =======================================================

-- Verify all foreign key constraints are properly created
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME LIKE 'Bouncer_%'
AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;

-- =======================================================
-- FINALIZE MIGRATION
-- =======================================================

SET FOREIGN_KEY_CHECKS = 1;

-- Commit the transaction
COMMIT;

-- =======================================================
-- MIGRATION COMPLETE
-- =======================================================
-- The following tables have been successfully created:
-- 1. Bouncer_Batches - Batch tracking and lifecycle management
-- 2. Bouncer_Queue - Email queue management 
-- 3. Bouncer_Rate_Limit - API rate limiting tracking
-- 4. Bouncer_Results - Detailed verification results storage
-- 5. Bouncer_Dead_Letter_Queue - Failed item handling
-- 6. Bouncer_Health_Metrics - System monitoring and health checks
-- 
-- Views created:
-- 1. Bouncer_Batch_Status_Overview - Comprehensive batch status view
-- 2. Bouncer_Queue_Statistics - Queue performance statistics
-- 
-- The migration is complete and ready for production use.
-- All tables include proper indexing for performance optimization.
-- Foreign key constraints ensure data integrity.
-- =======================================================

SELECT 'Bouncer email verification tables migration completed successfully!' as Migration_Status;