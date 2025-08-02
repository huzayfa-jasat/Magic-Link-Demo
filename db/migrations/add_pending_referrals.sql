-- Add pending referrals table to track referrals that are pending until users purchase 100k credits

DROP TABLE IF EXISTS `Pending_Referrals`;
CREATE TABLE Pending_Referrals (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrer_id` int NOT NULL,
	`referred_id` int NOT NULL,
	`credits_reward` int NOT NULL DEFAULT 25000,
	`referrer_eligible` TINYINT(1) NOT NULL DEFAULT 0,
	`referred_eligible` TINYINT(1) NOT NULL DEFAULT 0,
	`status` enum('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
	`created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`approved_ts` TIMESTAMP NULL DEFAULT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY (`referred_id`),
	FOREIGN KEY (`referrer_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`referred_id`) REFERENCES Users(`id`) ON DELETE CASCADE,
	INDEX idx_pending_status (`status`, `referrer_eligible`, `referred_eligible`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Update the referral reward amount in existing Referrals table to 25000
ALTER TABLE `Referrals` 
MODIFY COLUMN `credits_reward` int NOT NULL DEFAULT 25000;