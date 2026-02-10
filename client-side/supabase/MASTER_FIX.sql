-- ==========================================
-- MASTER FIX FOR SRI PICKLE SHOP
-- ==========================================
-- This script fixes: 
-- 1. Missing deduct_stock function (Red 404 error)
-- 2. Missing payment_process table (Red 403 error)
-- 3. RLS Policies for checkout
-- ==========================================

-- 1. FIX: Missing deduct_stock function
DROP FUNCTION IF EXISTS public.deduct_stock(UUID, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.deduct_stock(
    p_product_id UUID,
    p_quantity INTEGER,
    p_variant_label TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Update variations if label is provided
    IF p_variant_label IS NOT NULL AND p_variant_label <> '' THEN
        UPDATE public.shop_products
        SET variants = (
            SELECT jsonb_agg(
                CASE
                    WHEN v->>'label' = p_variant_label THEN
                        jsonb_set(v, '{stock}', ((COALESCE(v->>'stock', '0')::int - p_quantity)::text)::jsonb)
                    ELSE v
                END
            )
            FROM jsonb_array_elements(COALESCE(variants, '[]'::jsonb)) v
        )
        WHERE id = p_product_id;
    ELSE
        -- Update main stock for simple products
        UPDATE public.shop_products
        SET stock_quantity = COALESCE(stock_quantity, 0) - p_quantity
        WHERE id = p_product_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. FIX: Missing payment_process table
CREATE TABLE IF NOT EXISTS public.payment_process (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id text NOT NULL,
    process_step text NOT NULL,
    status text NOT NULL,
    meta_data jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now()
);

-- 3. FIX: Enable RLS and Permissions
ALTER TABLE public.payment_process ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert logs (needed for checkout tracking)
DROP POLICY IF EXISTS "Allow public insert for payment logging" ON public.payment_process;
CREATE POLICY "Allow public insert for payment logging" 
ON public.payment_process FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Allow anyone to read logs (for verification)
DROP POLICY IF EXISTS "Allow public read for payment logging" ON public.payment_process;
CREATE POLICY "Allow public read for payment logging" 
ON public.payment_process FOR SELECT 
TO anon, authenticated
USING (true);

-- Grant permissions to the function
GRANT EXECUTE ON FUNCTION public.deduct_stock(UUID, INTEGER, TEXT) TO anon, authenticated;

-- Ensure shop_products table has correct RLS for anonymous checkout
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read shop_products" ON public.shop_products;
CREATE POLICY "Allow public read shop_products" ON public.shop_products FOR SELECT TO anon, authenticated USING (true);

-- Ensure shop_orders can be created by anyone (needed for checkout)
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert orders" ON public.shop_orders;
CREATE POLICY "Allow public insert orders" ON public.shop_orders FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER TABLE public.shop_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert order items" ON public.shop_order_items;
CREATE POLICY "Allow public insert order items" ON public.shop_order_items FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ==========================================
-- DONE! Please run this in your Supabase SQL Editor.
-- ==========================================
