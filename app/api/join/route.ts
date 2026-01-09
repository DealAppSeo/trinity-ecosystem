import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Initialize standard client (lighter weight than auth-helpers)
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
        const body = await request.json();
        const { email } = body;

        if (!email || !email.includes('@')) {
            return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
        }

        // 1. Save to Supabase
        const { error } = await supabase
            .from('trinity_leads')
            .insert({ email, status: 'new' });

        if (error) {
            // Handle duplicate emails gracefully
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ success: true, message: 'Welcome back! You are already on the list.' });
            }
            throw error;
        }

        // 2. Trigger "Welcome" Email (Mock / Placeholder)
        // In production, this would call Resend/Mailchimp API
        console.log(`[EMAIL-SERVICE] Sending 'Welcome to the Spark' to ${email}`);

        return NextResponse.json({
            success: true,
            message: 'Welcome to the Spark. Check your inbox!'
        });

    } catch (error: any) {
        console.error('Lead Capture Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
