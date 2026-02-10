-- =====================================================
-- SRI PICKLES SECURITY HARDENING & IDOR PROTECTION
-- =====================================================
-- This script enforces strict Row Level Security (RLS)
-- to ensure users can ONLY access their own data.
-- =====================================================

-- 1. ENABLE RLS ON ALL TABLES (Including shop_ prefixed ones)
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shop_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_queries ENABLE ROW LEVEL SECURITY;

-- 2. SECURE PROFILES (IDOR Protection)
-- Users can only see/edit their own record.
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles 
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. SECURE ADDRESSES (IDOR Protection)
-- Prevents users from seeing or hijacking other users' addresses.
DROP POLICY IF EXISTS "Users can view own addresses" ON shop_addresses;
CREATE POLICY "Users can view own addresses" ON shop_addresses 
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own addresses" ON shop_addresses;
CREATE POLICY "Users can manage own addresses" ON shop_addresses 
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. SECURE ORDERS & ITEMS (IDOR Protection)
-- Users can only view their own orders and ordered items.
DROP POLICY IF EXISTS "Users can view own orders" ON shop_orders;
CREATE POLICY "Users can view own orders" ON shop_orders 
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own order items" ON shop_order_items;
CREATE POLICY "Users can view own order items" ON shop_order_items 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM shop_orders 
        WHERE shop_orders.id = shop_order_items.order_id 
        AND shop_orders.user_id = auth.uid()
    )
);

-- 5. SECURE CART
DROP POLICY IF EXISTS "Users can manage own cart" ON shop_cart;
CREATE POLICY "Users can manage own cart" ON shop_cart 
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. CONTACT QUERIES (Anti-Spam & Privacy)
-- Users can submit queries but NOT read them (only admins can read).
DROP POLICY IF EXISTS "Anyone can submit queries" ON customer_queries;
CREATE POLICY "Anyone can submit queries" ON customer_queries 
FOR INSERT WITH CHECK (true);

-- 7. ADMIN OVERRIDE
-- Ensure admins still have full access to manage the shop.
CREATE POLICY "Admins have full access to products" ON shop_products FOR ALL 
USING (EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true));

CREATE POLICY "Admins have full access to orders" ON shop_orders FOR ALL 
USING (EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true));

CREATE POLICY "Admins have full access to addresses" ON shop_addresses FOR ALL 
USING (EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true));

-- 8. STORAGE SECURITY (Avatar Privacy)
-- If privacy is paramount, we change the bucket to private and use signed URLs.
-- For now, we enforce folder ownership for uploads to prevent IDOR on file paths.
DROP POLICY IF EXISTS "Users can manage own avatar folder" ON storage.objects;
CREATE POLICY "Users can manage own avatar folder" ON storage.objects 
FOR ALL USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- AUDIT COMPLETE: Strict IDOR protection is now active.
-- =====================================================
