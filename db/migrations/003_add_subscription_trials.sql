-- Migration: Add trial support to subscription plans
-- Date: 2025-08-08

-- 1) Add trial columns to Subscription_Plans
ALTER TABLE Subscription_Plans
  ADD COLUMN trial_days INT NOT NULL DEFAULT 0 AFTER credits_per_period,
  ADD COLUMN trial_credits INT NOT NULL DEFAULT 0 AFTER trial_days;

-- 2) Seed: set 7-day/25k trial for the cheapest regular plan (display_order = 1)
UPDATE Subscription_Plans
SET trial_days = 7,
    trial_credits = 25000
WHERE subscription_type = 'regular' AND display_order = 1; 