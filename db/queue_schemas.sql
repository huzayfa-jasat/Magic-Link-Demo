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
    `email_nominal` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
    `status` enum('deliverable', 'risky', 'undeliverable', 'unknown') NOT NULL DEFAULT 'unknown',
    `reason` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT 'unknown',
    `is_catchall` TINYINT(1) NOT NULL DEFAULT 0,
    `score` int NOT NULL DEFAULT 0,
    `verified_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`email_global_id`),
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Single global results table for catchall toxicity checks
DROP TABLE IF EXISTS `Email_Catchall_Results`;
CREATE TABLE Email_Catchall_Results (
    `email_global_id` int NOT NULL,
    `email_nominal` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
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
    `used_cached` TINYINT(1) NOT NULL DEFAULT 0, -- 1 if result was from cache
    PRIMARY KEY (`batch_id`, `email_global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Batches_Deliverable(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Batch_Emails_Catchall`;
CREATE TABLE Batch_Emails_Catchall (
    `batch_id` int NOT NULL,
    `email_global_id` int NOT NULL,
    `used_cached` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`batch_id`, `email_global_id`),
    FOREIGN KEY (`batch_id`) REFERENCES Batches_Catchall(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`email_global_id`) REFERENCES Emails_Global(`global_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;