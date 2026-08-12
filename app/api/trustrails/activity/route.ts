// app/api/trustrails/activity/route.ts
//
// Aggregate operational history for the dashboard's operations panel.
//
// The dashboard reads two 12-row tables, so a system with 171,000+ rows of real
// history looks like a demo. This route surfaces the rest — trade decisions,
// agent activity, market signals, cross-LLM comparisons and vault access —
// as counts and coarse breakdowns.
//
// Aggregation happens in Postgres (trustrails_activity_summary), not here: the
// largest table has 138k rows and PostgREST cannot GROUP BY, so counting in the
// app would mean moving the whole table per request.
//
// Authenticated, but not institution-scoped — none of these tables carry an
// institution_id, so there is nothing to scope by. Scoping them is a schema
// change, not something to fake in the query layer.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';

// The summary scans ~170k rows and takes ~450ms. Cached briefly so a dashboard
// refresh, or several viewers at once, does not re-run it every time. Serverless
// instances each keep their own copy; this trims bursts, it is not a guarantee.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; payload: unknown } | null = null;

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const fresh = cache && Date.now() - cache.at < CACHE_TTL_MS;
    if (fresh) {
      return NextResponse.json({ ...(cache!.payload as object), cached: true });
    }

    const { data, error } = await getSupabaseAdmin().rpc('trustrails_activity_summary');

    if (error) {
      // Name the likely cause rather than returning a bare 500. A missing
      // function here means the migration has not been applied.
      return NextResponse.json(
        {
          error: `Activity summary unavailable: ${error.message}`,
          hint: 'Has supabase/migrations/20260812190000_activity_summary.sql been applied?',
        },
        { status: 500 }
      );
    }

    cache = { at: Date.now(), payload: data };
    return NextResponse.json({ ...(data as object), cached: false });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
