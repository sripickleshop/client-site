#!/bin/bash
# Initialize payments table schema and realtime policies

echo "Setting up Database Schema..."
supabase db reset --db-url <YOUR_DB_URL> < client-side/supabase/schema_payments.sql

echo "Enabling Realtime Subscriptions..."
supabase db reset --db-url <YOUR_DB_URL> < client-side/supabase/setup_realtime.sql

echo "Deploying Edge Functions..."
supabase functions deploy create-payment --no-verify-jwt
supabase functions deploy phonepe-webhook --no-verify-jwt
supabase functions deploy get-payment-status --no-verify-jwt
supabase functions deploy reconcile-payments --no-verify-jwt

echo "Setting Secrets (Replace values!)..."
# supabase secrets set PHONEPE_MERCHANT_ID="HIDDEN"
# supabase secrets set PHONEPE_SALT_KEY="HIDDEN"
# supabase secrets set PHONEPE_SALT_INDEX="1"
# supabase secrets set PHONEPE_ENVIRONMENT="SANDBOX" 

echo "Done! Payment System Live."
