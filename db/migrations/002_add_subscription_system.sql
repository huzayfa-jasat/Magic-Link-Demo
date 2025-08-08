-- Migration: Add subscription system tables for non-rolling monthly credits
-- Date: 2025-08-05

-- 1. Subscription plans catalog (separate plans for regular and catchall)
CREATE TABLE Subscription_Plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    subscription_type ENUM('regular', 'catchall') NOT NULL,
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_price VARCHAR(50) NOT NULL,
    credits_per_period INT NOT NULL DEFAULT 0,
    billing_period ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT 1,
    is_live BOOLEAN DEFAULT 0,
    display_order INT DEFAULT 0,
    features JSON,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active_live (is_active, is_live),
    INDEX idx_type_active (subscription_type, is_active, is_live)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- 2. User's active subscription records (separate for regular and catchall)
CREATE TABLE User_Subscriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    subscription_type ENUM('regular', 'catchall') NOT NULL,
    subscription_plan_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid') NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT 0,
    canceled_at TIMESTAMP NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (subscription_plan_id) REFERENCES Subscription_Plans(id),
    UNIQUE KEY unique_user_type (user_id, subscription_type),
    INDEX idx_stripe_sub_id (stripe_subscription_id),
    INDEX idx_status (status),
    INDEX idx_user_type (user_id, subscription_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- 3. Active subscription credits (non-rolling) - Regular
CREATE TABLE User_Deliverable_Sub_Credits (
    user_id INT PRIMARY KEY,
    credits_start INT NOT NULL,
    credits_left INT NOT NULL,
    expiry_ts TIMESTAMP NOT NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    CHECK (credits_left >= 0),
    CHECK (credits_left <= credits_start),
    INDEX idx_expiry (expiry_ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- 4. Active subscription credits (non-rolling) - Catchall
CREATE TABLE User_Catchall_Sub_Credits (
    user_id INT PRIMARY KEY,
    credits_start INT NOT NULL,
    credits_left INT NOT NULL,
    expiry_ts TIMESTAMP NOT NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    CHECK (credits_left >= 0),
    CHECK (credits_left <= credits_start),
    INDEX idx_expiry (expiry_ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- Seed initial test subscription plans (separate for regular and catchall)
-- Regular subscription plans
INSERT INTO Subscription_Plans 
(subscription_type, stripe_product_id, stripe_price_id, name, display_price, credits_per_period, billing_period, is_active, is_live, display_order)
VALUES
('regular', 'prod_test_regular_basic', 'price_test_regular_basic', 'Basic Email Monthly', '$29/month', 50000, 'monthly', 1, 0, 1),
('regular', 'prod_test_regular_pro', 'price_test_regular_pro', 'Pro Email Monthly', '$99/month', 200000, 'monthly', 1, 0, 2),
('regular', 'prod_test_regular_enterprise', 'price_test_regular_enterprise', 'Enterprise Email Monthly', '$299/month', 1000000, 'monthly', 1, 0, 3);

-- Catchall subscription plans
INSERT INTO Subscription_Plans 
(subscription_type, stripe_product_id, stripe_price_id, name, display_price, credits_per_period, billing_period, is_active, is_live, display_order)
VALUES
('catchall', 'prod_test_catchall_basic', 'price_test_catchall_basic', 'Basic Catchall Monthly', '$19/month', 5000, 'monthly', 1, 0, 1),
('catchall', 'prod_test_catchall_pro', 'price_test_catchall_pro', 'Pro Catchall Monthly', '$49/month', 20000, 'monthly', 1, 0, 2),
('catchall', 'prod_test_catchall_enterprise', 'price_test_catchall_enterprise', 'Enterprise Catchall Monthly', '$149/month', 100000, 'monthly', 1, 0, 3);