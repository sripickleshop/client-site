-- =====================================================
-- Sri Pickles Database Migration & Sync Script
-- =====================================================
-- This script ensures all tables match the 'shop_' prefix 
-- expected by the code. Run this in your Supabase SQL Editor.
-- =====================================================

-- 1. Rename existing tables to include 'shop_' prefix if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE products RENAME TO shop_products;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'orders') THEN
        ALTER TABLE orders RENAME TO shop_orders;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_items') THEN
        ALTER TABLE order_items RENAME TO shop_order_items;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'addresses') THEN
        ALTER TABLE addresses RENAME TO shop_addresses;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cart') THEN
        ALTER TABLE cart RENAME TO shop_cart;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'promo_codes') THEN
        ALTER TABLE promo_codes RENAME TO shop_promo_codes;
    END IF;
END $$;

-- 2. Ensure customer_queries table exists
CREATE TABLE IF NOT EXISTS customer_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, replied, closed
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure admin_profiles table exists for dashboard access
CREATE TABLE IF NOT EXISTS admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. RLS POLICIES FOR ADMIN ACCESS
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- Grant broad access to admins on all shop tables
DO $$ 
BEGIN
    -- DROP EXISTING ADMIN POLICIES TO AVOID CONFLICTS
    DROP POLICY IF EXISTS "Admins can do everything" ON shop_products;
    DROP POLICY IF EXISTS "Admins can do everything" ON shop_orders;
    DROP POLICY IF EXISTS "Admins can do everything" ON shop_order_items;
    DROP POLICY IF EXISTS "Admins can do everything" ON customer_queries;
    DROP POLICY IF EXISTS "Admins can do everything" ON admin_profiles;
    DROP POLICY IF EXISTS "Admins can view and edit own profile" ON admin_profiles;
END $$;

CREATE POLICY "Admins can do everything" ON shop_products FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admins can do everything" ON shop_orders FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admins can do everything" ON shop_order_items FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admins can do everything" ON customer_queries FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admins can view and edit own profile" ON admin_profiles FOR ALL USING (
    auth.uid() = id
);

-- =====================================================
-- 5. ENSURE AT LEAST ONE ADMIN EXISTS
-- =====================================================
-- IMPORTANT: Replace 'sripickleshop@gmail.com' with your actual email
-- and ensure you sign up first in the shop side, or use the SQL below
-- after identifying your user ID from auth.users.
-- =====================================================
