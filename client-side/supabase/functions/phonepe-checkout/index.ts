import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PHONEPE_PROD_URL = "https://api.phonepe.com/apis/hermes";
const PHONEPE_SANDBOX_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { amount, orderId, phone, redirectUrl, userId } = body;

    const MID = Deno.env.get('PHONEPE_MERCHANT_ID');
    const SALT = Deno.env.get('PHONEPE_SALT_KEY');
    const INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || "1";
    const ENV = Deno.env.get('PHONEPE_ENVIRONMENT') || "SANDBOX";

    if (!MID || !SALT) throw new Error("Missing PhonePe Configuration in Supabase Secrets");

    const BASE_URL = ENV === 'PRODUCTION' ? PHONEPE_PROD_URL : PHONEPE_SANDBOX_URL;

    // Build Payload
    const payload = {
      merchantId: MID,
      merchantTransactionId: orderId,
      merchantUserId: userId || ("M-" + Math.random().toString(36).substring(7)),
      amount: Math.round(amount * 100), // convert to paise
      redirectUrl: redirectUrl,
      redirectMode: "REDIRECT",
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/phonepe-webhook`,
      mobileNumber: phone || "9999999999",
      paymentInstrument: { type: "PAY_PAGE" }
    };

    const payloadBase64 = btoa(JSON.stringify(payload));
    const stringToSign = payloadBase64 + "/pg/v1/pay" + SALT;

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(stringToSign));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join("");
    const checksum = hashHex + "###" + INDEX;

    console.log(`[PhonePe] Call: MID=${MID.substring(0, 6)}... Env=${ENV} Checksum=${hashHex.substring(0, 6)}...`);

    const response = await fetch(`${BASE_URL}/pg/v1/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "accept": "application/json"
      },
      body: JSON.stringify({ request: payloadBase64 })
    });

    const data = await response.json();
    console.log(`[PhonePe Response] Status=${response.status} Code=${data.code} Message=${data.message || 'No message'}`);
    if (!data.success) {
      console.error(`[PhonePe Error Details]:`, JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("[Checkout Critical Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
