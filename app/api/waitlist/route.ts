import { NextResponse } from 'next/server';
import { processWaitlistSignup } from '@/lib/email/waitlist';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, name, company } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        // Call our internal routing function that hooks to Supabase and Resend
        const result = await processWaitlistSignup({ email, name, company });

        if (result.success) {
            return NextResponse.json({ message: "Successfully added to waitlist." }, { status: 200 });
        } else {
            return NextResponse.json({ error: result.error || "Failed to process Waitlist." }, { status: 500 });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Unknown server error." }, { status: 500 });
    }
}
