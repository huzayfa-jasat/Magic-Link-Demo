-- Internal Queue Management Schema
-- This schema handles the internal queue system for bouncer API integration
-- Supports combining multiple user batches into single bouncer batches for optimal throughput

-- Priority levels for queue jobs
-- ENUM('critical', 'high', 'normal', 'low')

-- Job types for queue processing
-- ENUM('create_batch', 'check_status', 'download_results', 'cleanup')

-- ==========================================
-- QUEUE MANAGEMENT TABLES
-- ==========================================

-- Main queue jobs table - handles all queue operations with priority system
DROP TABLE IF EXISTS `Queue_Jobs`;
CREATE TABLE Queue_Jobs (
    `id` int AUTO_INCREMENT NOT NULL,
    `job_type` enum('create_batch', 'check_status', 'download_results', 'cleanup') NOT NULL,
    `verification_type` enum('deliverable', 'catchall') NOT NULL,
    `priority` enum('critical', 'high', 'normal', 'low') NOT NULL DEFAULT 'normal',
    `status` enum('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `worker_id` varchar(50) DEFAULT NULL, -- ID of worker processing this job
    `retry_count` int NOT NULL DEFAULT 0, -- Track attempts (but no auto-retry per requirements)
    `scheduled_at` TIMESTAMP NULL DEFAULT NULL, -- For delayed job scheduling
    `started_at` TIMESTAMP NULL DEFAULT NULL,
    `completed_at` TIMESTAMP NULL DEFAULT NULL,
    `error_message` TEXT DEFAULT NULL,
    `job_data` JSON NOT NULL, -- Flexible data storage for job parameters
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_queue_processing (`status`, `priority`, `scheduled_at`, `verification_type`),
    INDEX idx_worker_assignment (`worker_id`, `status`),
    INDEX idx_job_cleanup (`status`, `completed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Worker management for concurrent processing (max 5 concurrent workers)
DROP TABLE IF EXISTS `Queue_Workers`;
CREATE TABLE Queue_Workers (
    `worker_id` varchar(50) NOT NULL,
    `status` enum('active', 'inactive', 'shutting_down') NOT NULL DEFAULT 'inactive',
    `current_job_id` int DEFAULT NULL,
    `verification_type` enum('deliverable', 'catchall') DEFAULT NULL, -- Worker specialization
    `last_heartbeat` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`worker_id`),
    FOREIGN KEY (`current_job_id`) REFERENCES Queue_Jobs(`id`) ON DELETE SET NULL,
    INDEX idx_worker_status (`status`, `last_heartbeat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ==========================================
-- EMAIL-TO-BOUNCER-BATCH TRACKING
-- ==========================================

-- SIMPLIFIED: Track which emails were sent to which bouncer batch ID
-- This allows us to map results back to the correct user batches when Bouncer returns results
-- Uses existing bouncer_batch_id from user batch tables instead of internal batch tables
DROP TABLE IF EXISTS `Bouncer_Batch_Emails_Deliverable`;
CREATE TABLE Bouncer_Batch_Emails_Deliverable (
    `bouncer_batch_id` varchar(50) NOT NULL, -- ID from bouncer API
    `email_global_id` int NOT NULL,
    `user_batch_id` int NOT NULL, -- CRITICAL: Track originating user batch for result mapping
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`bouncer_batch_id`, `email_global_id`),
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_batch_id`) REFERENCES Batches_Deliverable(`id`) ON DELETE CASCADE,
    INDEX idx_email_lookup (`email_global_id`, `bouncer_batch_id`),
    INDEX idx_user_batch_tracking (`user_batch_id`, `bouncer_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Bouncer_Batch_Emails_Catchall`;
CREATE TABLE Bouncer_Batch_Emails_Catchall (
    `bouncer_batch_id` varchar(50) NOT NULL, -- ID from bouncer API
    `email_global_id` int NOT NULL,
    `user_batch_id` int NOT NULL, -- CRITICAL: Track originating user batch for result mapping
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`bouncer_batch_id`, `email_global_id`),
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_batch_id`) REFERENCES Batches_Catchall(`id`) ON DELETE CASCADE,
    INDEX idx_email_lookup (`email_global_id`, `bouncer_batch_id`),
    INDEX idx_user_batch_tracking (`user_batch_id`, `bouncer_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ==========================================
-- RATE LIMITING TRACKER
-- ==========================================

-- Track API requests for rate limiting (200 req/min with 180 buffer)
DROP TABLE IF EXISTS `Rate_Limit_Tracker`;
CREATE TABLE Rate_Limit_Tracker (
    `id` int AUTO_INCREMENT NOT NULL,
    `verification_type` enum('deliverable', 'catchall') NOT NULL,
    `request_type` enum('create_batch', 'check_status', 'download_results') NOT NULL,
    `request_count` int NOT NULL DEFAULT 1,
    `window_start` TIMESTAMP NOT NULL,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_rate_limiting (`verification_type`, `window_start`, `request_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ==========================================
-- QUEUE METRICS AND MONITORING
-- ==========================================

-- Track queue performance metrics for monitoring and optimization
DROP TABLE IF EXISTS `Queue_Metrics`;
CREATE TABLE Queue_Metrics (
    `id` int AUTO_INCREMENT NOT NULL,
    `metric_type` enum('job_throughput', 'batch_size', 'processing_time', 'error_rate') NOT NULL,
    `verification_type` enum('deliverable', 'catchall') NOT NULL,
    `metric_value` decimal(10,2) NOT NULL,
    `period_start` TIMESTAMP NOT NULL,
    `period_end` TIMESTAMP NOT NULL,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_metrics_query (`metric_type`, `verification_type`, `period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;