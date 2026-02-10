-- Cleanup Legacy Tables
-- This script removes tables that are no longer needed by the new payment system.

-- 1. Drop payment_process (Legacy granular logging)
DROP TABLE IF EXISTS payment_process;

-- 2. Drop phonepe_logs (If exists, was used in older versions)
DROP TABLE IF EXISTS phonepe_logs;

-- NOTE: 'shop_orders' and 'payments' are CRITICAL and must NOT be dropped.
-- 'payments' stores the PhonePe transaction details.
-- 'shop_orders' stores the user's order details (items, address).
-- 'shop_products' and 'shop_cart' are also required.

-- 3. Cleanup unused functions via SQL is not possible for Edge Functions.
-- Use 'npx supabase functions delete <name>' for that.
