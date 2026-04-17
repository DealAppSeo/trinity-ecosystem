// app/api/trustrails/internal/update-agent/route.ts
// TrustRails Sprint — Created March 26 2026 by Gemini
// Proxy route to allow local setup scripts to update the production database

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { agent_name, agent_id_onchain } = await req.json();

  if (!agent_name || !agent_id_onchain) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
  );

  const { data, error } = await supabase
    .from('agent_kya_registry')
    .update({
      agent_id_onchain,
      registered_at: new Date().toISOString(),
    })
    .eq('agent_name', agent_name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, agent_name, agent_id_onchain });
}


export const dynamic = 'force-dynamic';
