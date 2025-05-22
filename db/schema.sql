SET NAMES utf8;
SET time_zone = '+00:00';
SET FOREIGN_KEY_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb3;

-- DB Schema

DROP TABLE IF EXISTS `Users`;
CREATE TABLE Users (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci
	`email` varchar(125) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
	`profile_picture` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci
	`referral_code` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
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

-- Credits Tables

DROP TABLE IF EXISTS `Users_Credits`;
CREATE TABLE Users_Credits (
	`user_id` int NOT NULL,
	`credit_balance` int NOT NULL,
	`created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`user_id`),
	FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

DROP TABLE IF EXISTS `Users_Credits_History`;
CREATE TABLE Users_Credits_History (
	`user_id` int NOT NULL,
	`credits_change` int NOT NULL,
	`change_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`user_id`, `change_ts`),
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