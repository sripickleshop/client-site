import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Webhook Handler - The Single Source of Truth
// Must be reliable, idempotent, and handle delays

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const json = await req.json();

        // 1. Verify Signature (Crucial for Security)
        const checksum = req.headers.get("X-VERIFY");
        const payloadBase64 = json.response; // PhonePe sends response in base64
        const SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY');
        const SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || "1";

        if (!checksum || !payloadBase64 || !SALT_KEY) {
            throw new Error("Invalid Webhook Request: Missing Components");
        }

        // Hash(payloadBase64 + "/pg/v1/status" + saltKey) + "###" + saltIndex
        // Wait, PhonePe webhook path might vary, standard check is simpler:
        // Actually, PhonePe sends the checksum for `response` + salt key
        // Standard verification: sha256(responseBase64 + saltKey) + "###" + saltIndex

        // NOTE: PhonePe documentation for V1/V2 webhooks says: CHECKSUM = SHA256(response + saltKey) + ### + saltIndex
        // Verify locally
        const stringToHash = payloadBase64 + SALT_KEY;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(stringToHash));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join("") + "###" + SALT_INDEX;

        if (computedChecksum !== checksum) {
            console.error("Signature Mismatch:", computedChecksum, "vs", checksum);
            throw new Error("Invalid Signature");
        }

        // 2. Decode Payload
        const decodedString = atob(payloadBase64);
        const data = JSON.parse(decodedString);

        if (!data || !data.data) throw new Error("Invalid Payload Structure");

        const { merchantTransactionId, state, paymentInstrument } = data.data;

        // 3. Map Status (PhonePe -> Our System)
        let newStatus = 'PENDING';
        if (data.code === 'PAYMENT_SUCCESS') newStatus = 'SUCCESS';
        else if (data.code === 'PAYMENT_ERROR' || data.code === 'PAYMENT_DECLINED') newStatus = 'FAILED';

        // 4. Update Database idempotently
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Fetch Metadata to get Internal Order ID
        const { data: paymentRecord, error: fetchError } = await supabase
            .from('payments')
            .select('metadata')
            .eq('order_id', merchantTransactionId)
            .single();

        if (fetchError) console.error("Could not fetch payment record metadata:", fetchError);

        const internalOrderId = paymentRecord?.metadata?.internalOrderId;

        // Update Payments Table
        const { error } = await supabase
            .from('payments')
            .update({
                status: newStatus,
                provider_txn_id: data.data.transactionId,
                metadata: { webhook_data: data, ...paymentRecord?.metadata }, // Merge
                updated_at: new Date().toISOString()
            })
            .eq('order_id', merchantTransactionId);

        if (error) throw new Error("Database Update Failed: " + error.message);

        // Sync with Shop Orders if linked
        if (internalOrderId && newStatus === 'SUCCESS') {
            const { error: shopOrderError } = await supabase
                .from('shop_orders')
                .update({
                    payment_status: 'completed',
                    status: 'processing', // Move from pending to processing
                    payment_id: merchantTransactionId,
                    payment_method: 'PhonePe Gateway'
                })
                .eq('id', internalOrderId);

            if (shopOrderError) console.error("Failed to update shop_orders:", shopOrderError);
        } else if (internalOrderId && newStatus === 'FAILED') {
            const { error: shopOrderError } = await supabase
                .from('shop_orders')
                .update({
                    payment_status: 'failed',
                    // Keep status as pending/draft so user can retry?
                })
                .eq('id', internalOrderId);
            if (shopOrderError) console.error("Failed to update shop_orders (failed status):", shopOrderError);
        }

        console.log(`Webhook Processed: ${merchantTransactionId} -> ${newStatus} (Internal: ${internalOrderId})`);

        // 5. Respond to PhonePe (Must be 200 OK)
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });

    } catch (error) {
        console.error("Webhook Error:", error);
        // Return 500 so PhonePe retries if it's a transient error (e.g. DB down)
        // Return 200 if it's a validation error (e.g. invalid signature) to stop retries?
        // Usually safe to return 400 for bad requests so they don't retry bad data forever.
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
        });
    }
});
