import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase'; // Using admin to bypass RLS if waitlist table is locked

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, email, github_username, what_building, pain_points } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // 1. Insert into Supabase
        const { error: dbError } = await supabase.from('waitlist').insert([{
            name: name || null,
            email,
            github_username: github_username || null,
            what_building: what_building || null,
            pain_points: pain_points ? JSON.stringify(pain_points) : null,
            source: 'landing_page'
        }]);

        if (dbError) {
            console.error("Supabase Error:", dbError);
            return NextResponse.json({ error: 'Database insertion failed' }, { status: 500 });
        }

        // 2. Send Email via Resend natively
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.warn("RESEND_API_KEY not found in environment. Email not sent.");
            return NextResponse.json({ success: true, warning: 'Email not sent due to missing key' });
        }

        const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "hello@aitrinitysymphony.com",
                to: email,
                subject: "You are on the Trinity Symphony founding member list",
                text: "Thank you for joining the Trinity Symphony private beta. You are one of 100 founding members. We will reach out with early access details shortly. Help people help people — the last, the lost, and the least. Micah 6:8. The Trinity Symphony Team."
            })
        });

        if (!emailResponse.ok) {
            const errRes = await emailResponse.text();
            console.error(`Resend API Error: ${errRes}`);
            // We return success still so the user sees a confirmation visually even if the email bounce
        }

        return NextResponse.json({ success: true, message: 'Waitlist joined successfully.' });
    } catch (e: any) {
        console.error("Waitlist API Error:", e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
