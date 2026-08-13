// app/api/trustrails/agents/route.ts
//
// Serves the agent grid. Replaces a browser-side `select('*')` on
// agent_kya_registry.
//
// Two problems with the previous shape: it depended on an `{anon} SELECT
// USING (true)` policy — and the publishable key that reaches it ships in the
// JS bundle, so that policy is a public one — and `select('*')` pulled every
// column into the browser when the grid renders six. `railway_url`, the
// spending limits, the ZKP proof CIDs, the SBT token ids and the custodian
// fields were all being handed out for nothing.
//
// Columns here are the exact set AgentRepIDGrid renders. Adding one is a
// deliberate act, which is the point (see app/api/CLAUDE.md: do not
// `select('*')` into a JSON response).

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';

const GRID_COLUMNS = [
  'agent_name',
  'repid_score',
  'repid_tier',
  'insurance_coverage',
  'human_custody_verified',
  'vault_access_permitted',
].join(', ');

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const { data, error } = await getSupabaseAdmin()
      .from('agent_kya_registry')
      .select(GRID_COLUMNS)
      .order('repid_score', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agents: data ?? [] });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
