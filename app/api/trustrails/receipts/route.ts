// app/api/trustrails/receipts/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';


export async function GET() {
  const { data } = await getSupabaseAdmin()
    .from('kya_compliance_receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  return NextResponse.json({ receipts: data || [] });
}


export const dynamic = 'force-dynamic';
