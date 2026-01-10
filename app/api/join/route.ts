import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        return NextResponse.json({ error: 'Database config missing' }, { status: 500 });
    }

    const supabase = createClient(url, key);

    try {
        const body = await request.json();
        const { email } = body;

        if (!email || !email.includes('@')) {
            return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
        }

        // 1. Generate Referral Code
        const referralCode = 'TR-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // 2. Save to Supabase
        const { error } = await supabase
            .from('trinity_leads')
            .insert({
                email,
                status: 'new',
                referral_code: referralCode,
            });

        if (error) {
            // Handle duplicate emails gracefully
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ success: true, message: 'Welcome back! You are already on the list.' });
            }
            throw error;
        }

        // 2. Trigger "Welcome" Email (Mock / Placeholder)
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

export async function PUT(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        return NextResponse.json({ error: 'Database config missing' }, { status: 500 });
    }

    const supabase = createClient(url, key);

    try {
        const body = await request.json();
        const { email, preferred_ecosystem, linkedin_handle, github_handle, why_interested } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email required to update record' }, { status: 400 });
        }

        // Update the record
        const { error } = await supabase
            .from('trinity_leads')
            .update({
                preferred_ecosystem,
                linkedin_handle,
                github_handle,
                why_interested,
                vote_timestamp: new Date().toISOString()
            })
            .eq('email', email);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Preferences saved. Welcome to the family.'
        });

    } catch (error: any) {
        console.error('Lead Update Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
