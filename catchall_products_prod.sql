-- Catchall Products for OmniVerifier
-- DEV and PROD keys for Stripe_Products table

-- ========================================
-- DEVELOPMENT KEYS (is_live = 0)
-- ========================================
INSERT INTO Stripe_Products (package_code, product_id, price_id, credits, is_live) VALUES
('catchall_10k', 'prod_SgDv0BHxIs8edk', 'price_1RkrTOLUw65dmYTVIoyJ8qji', 10000, 0),
('catchall_25k', 'prod_SgDvGiW1zvvk91', 'price_1RkrTZLUw65dmYTVTxyYXsXz', 25000, 0),
('catchall_50k', 'prod_SgDvT6Fp9F1lIs', 'price_1RkrTkLUw65dmYTVhIjAMzAC', 50000, 0),
('catchall_100k', 'prod_SgDvoRTWZFKwmj', 'price_1RkrTuLUw65dmYTVTM93wvj8', 100000, 0),
('catchall_250k', 'prod_SgDvOjHRfmdklq', 'price_1RkrU3LUw65dmYTVCWoUeGWD', 250000, 0),
('catchall_500k', 'prod_SgDw4yzTiE4Gkj', 'price_1RkrUFLUw65dmYTVL0mkrhDO', 500000, 0),
('catchall_1m', 'prod_SgDwPlvyAn3vVu', 'price_1RkrUQLUw65dmYTVmymdISpR', 1000000, 0);

-- ========================================
-- PRODUCTION KEYS (is_live = 1)
-- ========================================
INSERT INTO Stripe_Products (package_code, product_id, price_id, credits, is_live) VALUES
('catchall_10k', 'prod_SgDz40KUk178kf', 'price_1RkrXnLUw65dmYTVZVEQiuEi', 10000, 1),
('catchall_25k', 'prod_SgDz0COKGw77Um', 'price_1RkrXmLUw65dmYTV5rdFNouS', 25000, 1),
('catchall_50k', 'prod_SgDzU7jfZ1LdGD', 'price_1RkrXkLUw65dmYTVcvqoowHs', 50000, 1),
('catchall_100k', 'prod_SgDzXJdbyHmuSf', 'price_1RkrXjLUw65dmYTVURH0uWY7', 100000, 1),
('catchall_250k', 'prod_SgDz0SmfyV60cn', 'price_1RkrXhLUw65dmYTViTj9KAnU', 250000, 1),
('catchall_500k', 'prod_SgDzyJBUhNb5Dc', 'price_1RkrXgLUw65dmYTVSsCDkT49', 500000, 1),
('catchall_1m', 'prod_SgDz8iOjfqDya0', 'price_1RkrXeLUw65dmYTVrcWnk8KL', 1000000, 1);

-- ========================================
-- NOTES:
-- ========================================
-- is_live = 0: Development/Testing keys
-- is_live = 1: Production keys
-- 
-- The system automatically selects the correct keys based on NODE_ENV:
-- - Development: uses is_live = 0
-- - Production: uses is_live = 1
--
-- Prices:
-- 10K: $30
-- 25K: $85  
-- 50K: $148
-- 100K: $240
-- 250K: $525
-- 500K: $848
-- 1M: $1425 