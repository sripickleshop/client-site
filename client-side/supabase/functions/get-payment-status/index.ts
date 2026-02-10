import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Frontend Query Endpoint (Read Only)
// Only queries the trusted 'payments' table, never PhonePe directly.

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { orderId } = await req.json();

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data, error } = await supabase
            .from('payments')
            .select('status, amount, created_at, metadata')
            .eq('order_id', orderId)
            .single();

        if (error) throw new Error("Payment Not Found");

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
