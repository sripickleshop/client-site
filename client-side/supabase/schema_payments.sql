-- Database Schema for Backend-Authoritative PhonePe Payments

-- Create payments table to act as the single source of truth
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id text UNIQUE NOT NULL, -- The main identifier used with PhonePe (e.g., ORD-UUID)
    user_id uuid REFERENCES auth.users(id), -- Optional: Link to authenticated user
    amount integer NOT NULL, -- Amount in lowest currency unit (e.g., paise)
    currency text DEFAULT 'INR',
    status text NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')),
    provider text DEFAULT 'PHONEPE',
    provider_txn_id text, -- PhonePe transaction ID from webhook
    metadata jsonb DEFAULT '{}',
    redirect_url text, -- Where to redirect user after payment
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Index for reconciliation performance
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);

-- RLS Policies
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own payments via Realtime
CREATE POLICY "Users can view their own payments" 
ON public.payments FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Also allow public access if using anonymous orders (based on session/order_id match logic in app)
-- For this "Production Grade" setup, we heavily rely on Edge Functions for writing.
-- Reading can be open if we rely on the unique order_id being hard to guess (UUID-based).
CREATE POLICY "Public can view payments by Order ID" 
ON public.payments FOR SELECT 
TO anon 
USING (true); -- Simple read access for realtime (filter by ID in client)

-- Only Service Role (Edge Functions) can insert/update
CREATE POLICY "Service Role can manage all payments" 
ON public.payments FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Function to automatically update 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
