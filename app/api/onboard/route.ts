import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, tier, byok, byok_key, promo_code, referral_from } = body;

        if (!email || !email.includes('@')) {
            return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
        }

        // Store in trinity_leads or a dedicated early_adopters table
        // For MVP, we'll try to insert into a 'trinity_onboarding' table
        // If it doesn't exist, we fall back to logging it for now as a 'lead'

        const { data, error } = await supabase
            .from('trinity_onboarding')
            .insert([
                {
                    email,
                    tier,
                    byok_enabled: byok,
                    byok_key: byok_key || null,
                    promo_code: promo_code || null,
                    referral_code: referral_from || null,
                    status: 'pending_verification'
                }
            ])
            .select();

        if (error) {
            console.error('Supabase Onboarding Error:', error);
            // Fallback to leads table if onboarding table missing
            const { error: leadError } = await supabase
                .from('trinity_leads')
                .insert([{ email, source: 'early_adopter', metadata: body }]);

            if (leadError) throw leadError;
        }

        return NextResponse.json({ success: true, message: 'Onboarding successful' });

    } catch (e: any) {
        console.error('API Onboard Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
