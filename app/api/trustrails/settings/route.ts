// app/api/trustrails/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const institutionId = req.nextUrl.searchParams.get('institution') || 'default';
  
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('institution_config')
    .select('*')
    .eq('institution_id', institutionId)
    .single();

  return NextResponse.json({ config: data || {} });
}

export async function POST(req: NextRequest) {
  const { institutionId, config } = await req.json();

  if (!institutionId || !config) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('institution_config')
    .update(config)
    .eq('institution_id', institutionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}


export const dynamic = 'force-dynamic';
