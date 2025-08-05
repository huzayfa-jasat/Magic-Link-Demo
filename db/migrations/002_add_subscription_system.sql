-- Migration: Add subscription system tables for non-rolling monthly credits
-- Date: 2025-08-05

-- 1. Subscription plans catalog
CREATE TABLE Subscription_Plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_price VARCHAR(50) NOT NULL,
    regular_credits_per_period INT NOT NULL DEFAULT 0,
    catchall_credits_per_period INT NOT NULL DEFAULT 0,
    billing_period ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT 1,
    is_live BOOLEAN DEFAULT 0,
    display_order INT DEFAULT 0,
    features JSON,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active_live (is_active, is_live)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- 2. User's active subscription record
CREATE TABLE User_Subscriptions (
    user_id INT PRIMARY KEY,
    subscription_plan_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    status ENUM('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid') NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT 0,
    canceled_at TIMESTAMP NULL,
    created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (subscription_plan_id) REFERENCES Subscription_Plans(id),
    INDEX idx_stripe_sub_id (stripe_subscription_id),
    INDEX idx_status (status)
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

-- Seed initial test subscription plans
INSERT INTO Subscription_Plans 
(stripe_product_id, stripe_price_id, name, display_price, regular_credits_per_period, catchall_credits_per_period, billing_period, is_active, is_live, display_order)
VALUES
('prod_test_basic', 'price_test_basic', 'Basic Monthly', '$29/month', 50000, 5000, 'monthly', 1, 0, 1),
('prod_test_pro', 'price_test_pro', 'Pro Monthly', '$99/month', 200000, 20000, 'monthly', 1, 0, 2),
('prod_test_enterprise', 'price_test_enterprise', 'Enterprise Monthly', '$299/month', 1000000, 100000, 'monthly', 1, 0, 3);