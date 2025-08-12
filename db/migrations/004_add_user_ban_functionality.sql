-- Migration: Add user ban functionality
-- Date: 2025-08-12
-- Description: Add is_banned column to Users table to support account suspension

-- Add is_banned column to Users table
ALTER TABLE `Users`
ADD COLUMN `is_banned` TINYINT(1) NOT NULL DEFAULT 0
AFTER `stripe_id`;

-- Add index for faster lookups of banned users (optional but recommended for performance)
ALTER TABLE `Users`
ADD INDEX `idx_is_banned` (`is_banned`);