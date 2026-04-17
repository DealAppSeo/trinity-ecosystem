// app/api/trustrails/receipts/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
);

export async function GET() {
  const { data } = await supabase
    .from('kya_compliance_receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  return NextResponse.json({ receipts: data || [] });
}


export const dynamic = 'force-dynamic';
