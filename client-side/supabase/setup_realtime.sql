-- Setup script for PhonePe Webhook and Realtime permissions

-- Enable Realtime for payments table
alter publication supabase_realtime add table payments;

-- (Optional) If you have strict RLS, ensure anon users can SELECT their own payment (idempotent lookup)
create policy "Anon can view payments by order_id" 
on public.payments for select 
using (true); -- You might restrict this further if user_id is strictly required
