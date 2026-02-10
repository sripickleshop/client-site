import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// V2 Constants (New PhonePe Flow)
const PHONEPE_PROD_URL = "https://api.phonepe.com/apis/hermes";
const PHONEPE_SANDBOX_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const body = await req.json();
        console.log("Payment Request Body:", JSON.stringify(body));
        const { amount, phone, redirectUrl, userId, internalOrderId } = body;

        // 1. Secrets Management (Only in Backend)
        const MERCHANT_ID = Deno.env.get('PHONEPE_MERCHANT_ID');
        const SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY');
        const SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || "1";
        const ENV_TYPE = Deno.env.get('PHONEPE_ENVIRONMENT') || "SANDBOX"; // Default to Safe

        const BASE_URL = ENV_TYPE === 'PRODUCTION' ? PHONEPE_PROD_URL : PHONEPE_SANDBOX_URL;

        // 2. Validate Inputs
        if (!MERCHANT_ID || !SALT_KEY) throw new Error("Missing PhonePe Configuration");
        if (!amount || amount <= 0) throw new Error("Invalid Amount");

        // 3. Generate Cryptographically Secure ID
        const orderId = crypto.randomUUID(); // Unique Pay Request ID

        // 4. Create Database Record (PENDING) - Source of Truth
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { error: dbError } = await supabase
            .from('payments')
            .insert({
                order_id: orderId,
                amount: Math.round(amount * 100), // Store in paise
                status: 'PENDING',
                user_id: userId || null,
                metadata: { phone: phone, environment: ENV_TYPE, internalOrderId: internalOrderId }
            });

        if (dbError) throw new Error("Database Creation Failed: " + dbError.message);

        // 5. Construct PhonePe Payload
        const payload = {
            merchantId: MERCHANT_ID,
            merchantTransactionId: orderId,
            merchantUserId: userId || ("MUID-" + orderId),
            amount: Math.round(amount * 100), // Paise
            redirectUrl: redirectUrl, // Where user returns
            redirectMode: "REDIRECT",
            callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/phonepe-webhook`, // Server-to-Server Callback
            mobileNumber: phone,
            paymentInstrument: {
                type: "PAY_PAGE"
            }
        };

        const payloadString = JSON.stringify(payload);
        const payloadBase64 = btoa(payloadString);

        // 6. Signature Generation (X-VERIFY)
        const stringToSign = payloadBase64 + "/pg/v1/pay" + SALT_KEY;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(stringToSign));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join("") + "###" + SALT_INDEX;

        // 7. Call PhonePe API
        console.log(`Initiating Payment: ${orderId} (${ENV_TYPE})`);

        const headers = {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "accept": "application/json"
        };

        const response = await fetch(`${BASE_URL}/pg/v1/pay`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ request: payloadBase64 })
        });

        const data = await response.json();

        if (!data.success) {
            // Mark Failed in DB immediately if API rejects it
            await supabase.from('payments').update({ status: 'FAILED', metadata: { error: data } }).eq('order_id', orderId);
            throw new Error(data.message || "Payment Gateway Initiation Failed");
        }

        // 8. Return Redirect URL (Only info frontend needs)
        return new Response(JSON.stringify({
            success: true,
            redirectUrl: data.data.instrumentResponse.redirectInfo.url,
            orderId: orderId // Frontend can subscribe to this ID
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Create Payment Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
        });
    }
});
