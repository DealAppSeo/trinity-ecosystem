import { NextRequest, NextResponse } from 'next/server';
import { sendCohortWelcome } from '@/lib/mailer';
import { supabaseAdmin as supabase } from '@/lib/supabase';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, email, github_handle, linkedin_url, why_interested, role_type } = body;

        if (!name || !email || !role_type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Get spot number
        const { count, error: countError } = await supabase
            .from('developer_waitlist')
            .select('*', { count: 'exact', head: true });

        if (countError) throw countError;
        const spot_number = (count || 0) + 1;

        // 2. Insert into developer_waitlist
        const { data, error: insertError } = await supabase
            .from('developer_waitlist')
            .insert({
                name,
                email,
                github_handle,
                linkedin_url,
                why_interested,
                role_type,
                spot_number,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505') { // Unique constraint (email)
                return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
            }
            throw insertError;
        }

        // 3. Send Telegram Notification to Sean
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_OWNER_CHAT_ID) {
            const message = `🚀 *New Founding Cohort Applicant*\n\n*Name:* ${name}\n*Email:* ${email}\n*Role:* ${role_type}\n*GitHub:* ${github_handle || 'N/A'}\n*LinkedIn:* ${linkedin_url || 'N/A'}\n*Spot:* #${spot_number}\n\n*Break Query:* ${why_interested}`;

            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_OWNER_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
        }

        // 4. Send Mailgun Autoresponder Sequence (Email 1)
        await sendCohortWelcome(email, spot_number);

        return NextResponse.json({ success: true, spot_number });
    } catch (error: any) {
        console.error('Waitlist Submission Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
