import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "namaste@acharheritage.com"; // Default to business email

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContactRequest {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
}

const handler = async (req: Request): Promise<Response> => {
    // Handle CORS preflight request
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { name, email, phone, subject, message }: ContactRequest = await req.json();

        if (!RESEND_API_KEY) {
            throw new Error("Missing RESEND_API_KEY environment variable.");
        }

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: "Sri Pickles Website <contact@resend.dev>",
                to: [ADMIN_EMAIL],
                reply_to: email, // This allows you to just hit "Reply" in your email client
                subject: `New Inquiry: ${subject}`,
                html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #D32F2F;">New Contact Form Submission</h2>
            <div style="margin-bottom: 20px;">
                <p style="margin: 5px 0;"><strong>From:</strong> ${name}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p style="margin: 5px 0;"><strong>Phone:</strong> ${phone || "N/A"}</p>
                <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject}</p>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <h3 style="color: #555;">Message:</h3>
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #D32F2F; margin: 10px 0; white-space: pre-wrap; font-size: 16px;">${message}</div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              Sent from Sri Pickles Website Contact Form
            </p>
          </div>
        `,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("Resend API Error:", data);
            throw new Error(data.message || "Failed to send email via Resend");
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
};

serve(handler);
