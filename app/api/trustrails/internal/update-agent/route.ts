// app/api/trustrails/internal/update-agent/route.ts
// TrustRails Sprint — Created March 26 2026 by Gemini
// Proxy route to allow local setup scripts to update the production database

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// This route holds the service key and writes to the KYA registry — the table
// that decides which agents may move money. It was reachable unauthenticated by
// anyone who could guess the path. Require a shared secret.
//
// Fail closed: if INTERNAL_ROUTE_SECRET is unset the route refuses rather than
// silently accepting everyone, which is how an "internal" route stays open in
// exactly the environment where it matters.
function authorized(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.INTERNAL_ROUTE_SECRET;
  if (!expected) {
    return { ok: false, status: 503, error: 'INTERNAL_ROUTE_SECRET is not configured; route disabled.' };
  }
  const provided = req.headers.get('x-internal-secret');
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agent_name, agent_id_onchain } = await req.json();

  if (!agent_name || !agent_id_onchain) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

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
