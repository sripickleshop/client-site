-- FIX 1: Create missing deduct_stock function
DROP FUNCTION IF EXISTS deduct_stock(UUID, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION deduct_stock(
    p_product_id UUID,
    p_quantity INTEGER,
    p_variant_label TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF p_variant_label IS NOT NULL AND p_variant_label <> '' THEN
        UPDATE products
        SET variations = (
            SELECT jsonb_agg(
                CASE
                    WHEN v->>'label' = p_variant_label THEN
                        jsonb_set(v, '{stock}', ((v->>'stock')::int - p_quantity)::text::jsonb)
                    ELSE v
                END
            )
            FROM jsonb_array_elements(variations) v
        )
        WHERE id = p_product_id;
    ELSE
        UPDATE products
        SET stock = stock - p_quantity
        WHERE id = p_product_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- FIX 2: Create missing payment_process table for logging
CREATE TABLE IF NOT EXISTS public.payment_process (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id text NOT NULL,
    process_step text NOT NULL,
    status text NOT NULL,
    meta_data jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now()
);

-- FIX 3: Enable RLS and add policies for payment_process
ALTER TABLE public.payment_process ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert for payment logging" ON public.payment_process;
CREATE POLICY "Allow public insert for payment logging" 
ON public.payment_process FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow users to view their own logs" ON public.payment_process;
CREATE POLICY "Allow users to view their own logs" 
ON public.payment_process FOR SELECT 
TO anon, authenticated
USING (true);

-- FIX 4: Grant execution on the function
GRANT EXECUTE ON FUNCTION deduct_stock(UUID, INTEGER, TEXT) TO anon, authenticated;
