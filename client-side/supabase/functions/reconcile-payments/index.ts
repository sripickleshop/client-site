import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reconciler - Background Process to Scan Stuck Payments
// Run this periodically (Cron Job) or on-demand

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Find PENDING payments older than 1 minute (Configurable)
        const threshold = new Date(Date.now() - 60000).toISOString();

        const { data: stuckPayments, error: fetchError } = await supabase
            .from('payments')
            .select('order_id, created_at')
            .eq('status', 'PENDING')
            .lte('created_at', threshold)
            .limit(10); // Batch size

        if (fetchError || !stuckPayments) throw new Error("Fetch Error: " + fetchError?.message);

        console.log(`Scanning: Found ${stuckPayments.length} stuck payments.`);

        // 2. Poll PhonePe Status API for each
        const updates = [];

        // V2 Check Status Endpoint
        const BASE_URL = Deno.env.get('PHONEPE_ENVIRONMENT') === 'PRODUCTION'
            ? "https://api.phonepe.com/apis/hermes/pg/v1/status"
            : "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";

        for (const payment of stuckPayments) {
            // Construct Checksum for Status Check
            const stringToSign = `/pg/v1/status/${Deno.env.get('PHONEPE_MERCHANT_ID')}/${payment.order_id}` + Deno.env.get('PHONEPE_SALT_KEY');
            const checksum = await sha256(stringToSign) + "###" + (Deno.env.get('PHONEPE_SALT_INDEX') || "1");

            try {
                const res = await fetch(`${BASE_URL}/${payment.order_id}`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "X-VERIFY": checksum,
                        "X-MERCHANT-ID": Deno.env.get('PHONEPE_MERCHANT_ID'),
                        "accept": "application/json"
                    }
                });

                const result = await res.json();

                // 3. Update DB if Status Changed
                if (result.success && result.code === 'PAYMENT_SUCCESS') {
                    updates.push(supabase
                        .from('payments')
                        .update({ status: 'SUCCESS', updated_at: new Date().toISOString() })
                        .eq('order_id', payment.order_id)
                    );
                } else if (result.code === 'PAYMENT_ERROR') {
                    updates.push(supabase
                        .from('payments')
                        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                        .eq('order_id', payment.order_id)
                    );
                }
            } catch (e) {
                console.error(`Failed to reconcile ${payment.order_id}:`, e);
            }
        }

        if (updates.length > 0) await Promise.all(updates);

        return new Response(JSON.stringify({
            reconciled: updates.length,
            processed: stuckPayments.length
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Reconciliation Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
        });
    }
});

async function sha256(msg) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(msg));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
