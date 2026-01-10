
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Initialize Supabase Admin client to check codes securely
// Initialize Supabase Admin client to check codes securely
// Use safe pattern to prevent build-time crash
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = (URL && KEY)
    ? createClient(URL, KEY)
    : null;

export async function POST(req: Request) {
    try {
        const { code } = await req.json();

        if (!code) {
            return NextResponse.json({ success: false, message: 'Code required' }, { status: 400 });
        }

        // 1. Check if Code Exists & is valid
        const { data: invite, error } = await supabaseAdmin
            .from('trinity_access_invites')
            .select('*')
            .eq('code', code)
            .eq('status', 'active')
            .single();

        if (error || !invite) {
            // Fallback for Master Key (e.g. env variable)
            if (process.env.MASTER_ACCESS_KEY && code === process.env.MASTER_ACCESS_KEY) {
                // Create session for master key
                (await cookies()).set('trinity_access_token', 'master-access-granted', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 60 * 60 * 24, // 24 hours
                    path: '/',
                    domain: process.env.NODE_ENV === 'production' ? '.aitrinitysymphony.com' : undefined
                });
                return NextResponse.json({ success: true, message: 'Master Access Granted' });
            }
            return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 401 });
        }

        // 2. Code is valid -> Mark as used (if single use?) 
        // For now, let's keep them reusable until we implement single-use logic strictly
        // Or maybe we just log it. 
        // Let's UPDATE 'used_by' or similar if we had auth, but we don't know who this is yet.

        // 3. Set Cookie
        // Cookie allows access to *.aitrinitysymphony.com subdomains if configured correctly
        const token = `trinity-access-${code}-${Date.now()}`;

        (await cookies()).set('trinity_access_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24, // 24 hours
            path: '/',
            domain: process.env.NODE_ENV === 'production' ? '.aitrinitysymphony.com' : undefined
        });

        return NextResponse.json({ success: true, message: 'Access Granted' });

    } catch (error) {
        console.error('Access Code Error:', error);
        return NextResponse.json({ success: false, message: 'Server check failed' }, { status: 500 });
    }
}
