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
    PRIMARY KEY (`user_id`, `usage_ts`),
    FOREIGN KEY (`user_id`) REFERENCES Users(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
