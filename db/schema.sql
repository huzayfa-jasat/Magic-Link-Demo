SET NAMES utf8;
SET time_zone = '+00:00';
SET FOREIGN_KEY_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb3;

-- DB Schema

DROP TABLE IF EXISTS `Early_Access_Codes`;
CREATE TABLE Early_Access_Codes (
	`txt_code` varchar(15) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`num_credits` int NOT NULL DEFAULT 0,
	PRIMARY KEY (`txt_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users`;
CREATE TABLE Users (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
	`email` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`profile_image` LONGBLOB,
	`referral_code` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`api_key` varchar(64) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci UNIQUE,
    `stripe_id` TEXT CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
	`created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	UNIQUE KEY (`email`),
	UNIQUE KEY (`referral_code`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users_Auth`;
CREATE TABLE Users_Auth (
	`user_id` int NOT NULL,
	`hash` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`salt` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	PRIMARY KEY (`user_id`),
	FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `PassReset_Codes`;
CREATE TABLE PassReset_Codes (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`code` varchar(6) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `expires_at` TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE),
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY (`code`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `OTP_Codes`;
CREATE TABLE OTP_Codes (
	`user_id` int NOT NULL,
	`code` varchar(6) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `expires_at` TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE),
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Referrals`;
CREATE TABLE Referrals (
	`referrer_id` int NOT NULL,
	`referred_id` int NOT NULL,
	`credits_reward` int NOT NULL DEFAULT 5000,
	`created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`referred_id`),
	FOREIGN KEY (`referrer_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`referred_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Payment Tables

DROP TABLE IF EXISTS `Stripe_Products`;
CREATE TABLE Stripe_Products (
	id INT AUTO_INCREMENT PRIMARY KEY,
	package_code VARCHAR(64) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL UNIQUE,
	product_id VARCHAR(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	price_id VARCHAR(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	credits INT NOT NULL DEFAULT 0,
    display_title VARCHAR(75) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    display_bonus VARCHAR(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
    display_total VARCHAR(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci,
    display_amount VARCHAR(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    display_price VARCHAR(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	is_live TINYINT(1) NOT NULL DEFAULT 0,
	credit_type ENUM('default', 'catchall') NOT NULL DEFAULT 'default'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Stripe_Purchases`;
CREATE TABLE Stripe_Purchases (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	session_id VARCHAR(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	credits INT NOT NULL,
	status VARCHAR(32) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Stripe_Catchall_Purchases`;
CREATE TABLE Stripe_Catchall_Purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_id VARCHAR(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    credits INT NOT NULL,
    status VARCHAR(32) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Credits Tables

DROP TABLE IF EXISTS `Users_Credit_Balance`;
CREATE TABLE Users_Credit_Balance (
	`user_id` int NOT NULL,
	`current_balance` int NOT NULL,
	PRIMARY KEY (`user_id`),
	FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users_Credit_Balance_History`;
CREATE TABLE Users_Credit_Balance_History (
	`user_id` int NOT NULL,
	`credits_used` int NOT NULL,
	`usage_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`event_typ` enum('usage', 'refer_reward', 'purchase', 'signup') CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'purchase',
	PRIMARY KEY (`user_id`, `usage_ts`),
	FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users_Catchall_Credit_Balance`;
CREATE TABLE Users_Catchall_Credit_Balance (
    `user_id` int NOT NULL,
    `current_balance` int NOT NULL,
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users_Catchall_Credit_Balance_History`;
CREATE TABLE Users_Catchall_Credit_Balance_History (
    `user_id` int NOT NULL,
    `credits_used` int NOT NULL,
    `usage_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`event_typ` enum('usage', 'refer_reward', 'purchase', 'signup') CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'purchase',
    PRIMARY KEY (`user_id`, `usage_ts`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Email Processing Tables

DROP TABLE IF EXISTS `Emails_Global`;
CREATE TABLE Emails_Global (
    `global_id` int AUTO_INCREMENT NOT NULL,
    `email_stripped` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`global_id`),
    UNIQUE KEY (`email_stripped`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Single global results table for deliverability checks
DROP TABLE IF EXISTS `Email_Deliverable_Results`;
CREATE TABLE Email_Deliverable_Results (
    `email_global_id` int NOT NULL,
    `status` enum('deliverable', 'risky', 'undeliverable', 'unknown') NOT NULL DEFAULT 'unknown',
    `reason` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'unknown',
    `is_catchall` TINYINT(1) NOT NULL DEFAULT 0,
    `score` int NOT NULL DEFAULT 0,
    `provider` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
    `verified_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`email_global_id`),
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Single global results table for catchall toxicity checks
DROP TABLE IF EXISTS `Email_Catchall_Results`;
CREATE TABLE Email_Catchall_Results (
    `email_global_id` int NOT NULL,
    `toxicity` int NOT NULL,
    `verified_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`email_global_id`),
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Batch tables remain mostly the same but track summary info
DROP TABLE IF EXISTS `Batches_Deliverable`;
CREATE TABLE Batches_Deliverable (
    `id` int AUTO_INCREMENT NOT NULL,
    `title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `bouncer_batch_id` varchar(50) DEFAULT NULL, -- NULL if no external API call needed
    `user_id` int NOT NULL,
    `status` enum('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
    `total_emails` int NOT NULL DEFAULT 0,
    `cached_results` int NOT NULL DEFAULT 0, -- Count of results reused from cache
    `new_verifications` int NOT NULL DEFAULT 0, -- Count sent to external API
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_ts` TIMESTAMP NULL DEFAULT NULL,
    `is_archived` tinyint(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Batches_Catchall`;
CREATE TABLE Batches_Catchall (
    `id` int AUTO_INCREMENT NOT NULL,
    `title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `bouncer_batch_id` varchar(50) DEFAULT NULL, -- NULL if no external API call needed
    `user_id` int NOT NULL,
    `status` enum('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
    `total_emails` int NOT NULL DEFAULT 0,
    `cached_results` int NOT NULL DEFAULT 0,
    `new_verifications` int NOT NULL DEFAULT 0,
    `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_ts` TIMESTAMP NULL DEFAULT NULL,
    `is_archived` tinyint(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Association tables to track which emails belong to which batches
DROP TABLE IF EXISTS `Batch_Emails_Deliverable`;
CREATE TABLE Batch_Emails_Deliverable (
    `batch_id` int NOT NULL,
    `email_global_id` int NOT NULL,
    `email_nominal` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `used_cached` TINYINT(1) NOT NULL DEFAULT 0, -- 1 if result was from cache
    `did_complete` TINYINT(1) NOT NULL DEFAULT 0, -- 1 if email was processed
    PRIMARY KEY (`batch_id`, `email_global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Batches_Deliverable(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Batch_Emails_Catchall`;
CREATE TABLE Batch_Emails_Catchall (
    `batch_id` int NOT NULL,
    `email_global_id` int NOT NULL,
    `email_nominal` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `used_cached` TINYINT(1) NOT NULL DEFAULT 0, -- 1 if result was from cache
    `did_complete` TINYINT(1) NOT NULL DEFAULT 0, -- 1 if email was processed
    PRIMARY KEY (`batch_id`, `email_global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Batches_Catchall(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

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


-- Queue Management Tables

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