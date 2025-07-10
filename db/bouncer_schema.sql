-- ============================================================================
-- Bouncer Email Verification System Database Schema
-- ============================================================================
-- This schema defines all tables required for the Bouncer email verification
-- integration with managed queue system using BullMQ.
--
-- Features:
-- - Batch processing of up to 10,000 emails per batch
-- - Maximum 15 concurrent batches
-- - Rate limiting (200 requests/minute)
-- - Comprehensive error handling and retry logic
-- - Queue persistence across application restarts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Bouncer Batches Table
-- ----------------------------------------------------------------------------
-- Tracks individual batches submitted to the Bouncer API
-- Each batch can contain up to 10,000 emails
DROP TABLE IF EXISTS `Bouncer_Batches`;
CREATE TABLE Bouncer_Batches (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` varchar(50) NOT NULL, -- From Bouncer API
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `status` enum('queued', 'processing', 'completed', 'failed', 'downloading') NOT NULL DEFAULT 'queued',
    `quantity` int NOT NULL,
    `duplicates` int NOT NULL DEFAULT 0,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `completed_ts` TIMESTAMP NULL,
    `error_message` TEXT,
    `retry_count` int NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY (`batch_id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    INDEX idx_status (`status`),
    INDEX idx_created (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Bouncer Queue Table
-- ----------------------------------------------------------------------------
-- Queue for emails waiting to be processed
-- Manages batching and priority queuing of individual emails
DROP TABLE IF EXISTS `Bouncer_Queue`;
CREATE TABLE Bouncer_Queue (
    `queue_id` int AUTO_INCREMENT NOT NULL,
    `global_id` int NOT NULL,
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `batch_id` int NULL, -- References Bouncer_Batches.id when assigned
    `status` enum('queued', 'assigned', 'completed', 'failed') NOT NULL DEFAULT 'queued',
    `priority` int NOT NULL DEFAULT 0, -- For queue ordering (higher = higher priority)
    `domain_hash` varchar(64), -- For optimization: grouping by domain
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `assigned_ts` TIMESTAMP NULL,
    `completed_ts` TIMESTAMP NULL,
    PRIMARY KEY (`queue_id`),
    FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    FOREIGN KEY (`batch_id`) REFERENCES Bouncer_Batches(`id`) ON DELETE SET NULL,
    INDEX idx_status_priority (`status`, `priority` DESC),
    INDEX idx_domain_hash (`domain_hash`),
    INDEX idx_created (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Bouncer Rate Limit Table
-- ----------------------------------------------------------------------------
-- Tracks API rate limiting to enforce 200 requests/minute limit
-- Used for distributed rate limiting across multiple workers
DROP TABLE IF EXISTS `Bouncer_Rate_Limit`;
CREATE TABLE Bouncer_Rate_Limit (
    `id` int AUTO_INCREMENT NOT NULL,
    `request_count` int NOT NULL DEFAULT 0,
    `window_start_ts` TIMESTAMP NOT NULL,
    `window_end_ts` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    INDEX idx_window (`window_start_ts`, `window_end_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Bouncer Results Table
-- ----------------------------------------------------------------------------
-- Stores detailed results from Bouncer API for each email
-- Contains comprehensive verification data including scores and metadata
DROP TABLE IF EXISTS `Bouncer_Results`;
CREATE TABLE Bouncer_Results (
    `batch_id` int NOT NULL,
    `global_id` int NOT NULL,
    `bouncer_status` varchar(50) NOT NULL, -- deliverable, undeliverable, etc.
    `bouncer_reason` varchar(100),
    `domain_info` JSON,
    `account_info` JSON,
    `dns_info` JSON,
    `provider` varchar(100),
    `score` int,
    `toxic` varchar(20),
    `toxicity` int,
    `processed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`batch_id`, `global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Bouncer_Batches(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Bouncer Dead Letter Queue Table
-- ----------------------------------------------------------------------------
-- Stores permanently failed items that couldn't be processed
-- Used for manual review and debugging of persistent failures
DROP TABLE IF EXISTS `Bouncer_Dead_Letter_Queue`;
CREATE TABLE Bouncer_Dead_Letter_Queue (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` int NOT NULL,
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `error_message` TEXT NOT NULL,
    `failed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `reviewed` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
    INDEX idx_failed_ts (`failed_ts`),
    INDEX idx_reviewed (`reviewed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Bouncer Health Metrics Table
-- ----------------------------------------------------------------------------
-- System health monitoring and metrics collection
-- Used for performance monitoring and alerting
DROP TABLE IF EXISTS `Bouncer_Health_Metrics`;
CREATE TABLE Bouncer_Health_Metrics (
    `id` int AUTO_INCREMENT NOT NULL,
    `metric_name` varchar(100) NOT NULL,
    `metric_value` int NOT NULL,
    `recorded_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_metric_time (`metric_name`, `recorded_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ============================================================================
-- End of Bouncer Email Verification System Database Schema
-- ============================================================================