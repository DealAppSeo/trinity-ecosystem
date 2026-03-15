import axios from 'axios';
import { supabaseAdmin as supabase } from '../supabase';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEAN_EMAIL = "sean@trinitysymphony.com"; // Replace with actual address if needed

export interface WaitlistSubmission {
    email: string;
    name?: string;
    company?: string;
}

export async function processWaitlistSignup(data: WaitlistSubmission) {
    if (!data || !data.email) {
        throw new Error("Email is required for TrustShell waitlist.");
    }

    console.log(`[WAITLIST] 📩 Processing new TrustShell.dev waitlist signup: ${data.email}`);

    // 1. Log to Supabase
    try {
        await supabase.from('trustshell_waitlist').insert({
            email: data.email,
            name: data.name || '',
            company: data.company || '',
            status: 'PENDING_INVITE',
            created_at: new Date().toISOString()
        });
        console.log(`[WAITLIST] ✅ Saved to trustshell_waitlist DB.`);
    } catch (e: any) {
        console.error(`[WAITLIST] ❌ Supabase DB failure: ${e.message}`);
    }

    // 2. Transmit via Resend 
    if (!RESEND_API_KEY) {
        console.warn(`[WAITLIST] ⚠️ RESEND_API_KEY not found. Skipping confirmation emails.`);
        return { success: true, emailSent: false };
    }

    try {
        // A. Send confirmation to the user
        await axios.post('https://api.resend.com/emails', {
            from: "TrustShell <hello@trinitysymphony.com>",
            to: data.email,
            subject: "You're on the list! Welcome to TrustShell.",
            html: `
                <h2>Welcome to the TrustShell Alpha</h2>
                <p>Hello ${data.name ? data.name : ''},</p>
                <p>You have successfully secured your spot on the TrustShell waitlist.</p>
                <p>As we finalize our ERC-8004 validation and BFT consensus modules, you will be among the first to receive integration access.</p>
                <br/>
                <p>Prepare to build safer agents.</p>
                <p>- <strong>The Trinity Symphony Team</strong></p>
            `
        }, {
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
        });

        // B. Send notification to Sean
        await axios.post('https://api.resend.com/emails', {
            from: "TrustShell SYSTEM <system@trinitysymphony.com>",
            to: SEAN_EMAIL,
            subject: `[LEAD] New TrustShell Waitlist: ${data.email}`,
            text: `New signup acquired:\nEmail: ${data.email}\nName: ${data.name}\nCompany: ${data.company}`
        }, {
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
        });

        console.log(`[WAITLIST] 📨 Resend processing complete.`);
        return { success: true, emailSent: true };

    } catch (e: any) {
        console.error(`[WAITLIST] ❌ Resend transmission failed: ${e.response?.data?.message || e.message}`);
        return { success: false, emailSent: false, error: e.message };
    }
}
