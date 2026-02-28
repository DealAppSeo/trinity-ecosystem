import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            type,
            name,
            email,
            github_username,
            linkedin_handle,
            org_name,
            building_desc,
            pains,
            plan_choice,
            notes
        } = body;

        // Basic validation
        if (!type || !name || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('trinity_waitlist')
            .insert({
                type,
                name,
                email,
                github_username,
                linkedin_handle,
                org_name,
                building_desc,
                pains,
                plan_choice,
                notes,
                metadata: {
                    source: 'aitrinitysymphony.com',
                    user_agent: req.headers.get('user-agent'),
                    referrer: req.headers.get('referer')
                }
            })
            .select()
            .single();

        if (error) {
            console.error('[WAITLIST] Insert Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: data.id });

    } catch (e: any) {
        console.error('[WAITLIST] API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
