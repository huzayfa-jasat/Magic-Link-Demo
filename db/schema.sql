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

-- Email Tables

DROP TABLE IF EXISTS `Contacts_Global`;
CREATE TABLE Contacts_Global (
	`global_id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`latest_result` enum('valid', 'invalid', 'catch-all', 'disposable', 'unknown', 'processing') NOT NULL DEFAULT 'processing',
	`last_mail_server` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'other',
	`created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`global_id`),
	UNIQUE KEY (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Contacts_Global_History`;
CREATE TABLE Contacts_Global_History (
	`global_id` int NOT NULL,
	`result` enum('valid', 'invalid', 'catch-all', 'disposable', 'unknown') NOT NULL DEFAULT 'unknown',
	`mail_server` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'other',
	`change_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`global_id`, `change_ts`),
	FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- more ?

-- Request Tables

DROP TABLE IF EXISTS `Requests`;
CREATE TABLE Requests (
	`request_id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`request_type` enum('single', 'bulk') CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`request_status` enum('pending', 'completed', 'failed') CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`start_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`end_ts` TIMESTAMP NULL DEFAULT NULL,
	`num_contacts` int NOT NULL,
	`num_processed` int NOT NULL,
	`file_name` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	PRIMARY KEY (`request_id`),
	FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Requests_Contacts`;
CREATE TABLE Requests_Contacts (
	`request_id` int NOT NULL,
	`global_id` int NOT NULL,
	`processed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`request_id`, `global_id`),
	FOREIGN KEY (`request_id`) REFERENCES Requests(`request_id`) ON DELETE CASCADE,
	FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

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

-- ============================================================================
-- Catchall Email Verification System Tables
-- ============================================================================
-- Duplicating verify system but for deep catchall detection

-- ----------------------------------------------------------------------------
-- Catchall Batches Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Batches`;
CREATE TABLE Catchall_Batches (
    `id` int AUTO_INCREMENT NOT NULL,
    `batch_id` varchar(50) NOT NULL, -- From Catchall API
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
-- Catchall Queue Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Queue`;
CREATE TABLE Catchall_Queue (
    `queue_id` int AUTO_INCREMENT NOT NULL,
    `global_id` int NOT NULL,
    `user_id` int NOT NULL,
    `request_id` int NOT NULL,
    `batch_id` int NULL, -- References Catchall_Batches.id when assigned
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
    FOREIGN KEY (`batch_id`) REFERENCES Catchall_Batches(`id`) ON DELETE SET NULL,
    INDEX idx_status_priority (`status`, `priority` DESC),
    INDEX idx_domain_hash (`domain_hash`),
    INDEX idx_created (`created_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Catchall Rate Limit Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Rate_Limit`;
CREATE TABLE Catchall_Rate_Limit (
    `id` int AUTO_INCREMENT NOT NULL,
    `request_count` int NOT NULL DEFAULT 0,
    `window_start_ts` TIMESTAMP NOT NULL,
    `window_end_ts` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    INDEX idx_window (`window_start_ts`, `window_end_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Catchall Results Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Results`;
CREATE TABLE Catchall_Results (
    `batch_id` int NOT NULL,
    `global_id` int NOT NULL,
    `catchall_status` varchar(50) NOT NULL, -- good, bad, unknown, etc.
    `catchall_reason` varchar(100),
    `domain_info` JSON,
    `account_info` JSON,
    `dns_info` JSON,
    `provider` varchar(100),
    `score` int,
    `toxic` varchar(20),
    `toxicity` int,
    `processed_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`batch_id`, `global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Catchall_Batches(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`global_id`) REFERENCES Contacts_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Catchall Dead Letter Queue Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Dead_Letter_Queue`;
CREATE TABLE Catchall_Dead_Letter_Queue (
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
-- Catchall Health Metrics Table
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `Catchall_Health_Metrics`;
CREATE TABLE Catchall_Health_Metrics (
    `id` int AUTO_INCREMENT NOT NULL,
    `metric_name` varchar(100) NOT NULL,
    `metric_value` int NOT NULL,
    `recorded_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_metric_time (`metric_name`, `recorded_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Catchall Credits Tables
-- ----------------------------------------------------------------------------
-- Separate credit system for catchall verification


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
    PRIMARY KEY (`user_id`, `usage_ts`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------------------------------------------------------
-- Catchall Stripe Products Table
-- ----------------------------------------------------------------------------
-- Separate pricing plans for catchall credits


-- Keep existing table for regular credits

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