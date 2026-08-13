// app/api/trustrails/settings/route.ts
//
// Reads and writes an institution's risk policy. Both verbs require an
// authenticated principal with membership in the institution being addressed.
//
// This route previously took `institutionId` from the request body and did
// `.update(config)` with the body, unauthenticated, using the service key —
// which made every column of institution_config writable by anyone who could
// reach the endpoint, including the veto toggle, the RepID floor, the daily
// spend cap, and the freeze flag. See docs/E2E-AUDIT.md.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authorizeInstitution, authErrorResponse } from '@/lib/auth';
import { validateConfigPatch } from '@/lib/institution-config-schema';

export async function GET(req: NextRequest) {
  try {
    const actor = await authenticate(req);
    const institutionId = req.nextUrl.searchParams.get('institution') || 'default';
    const role = await authorizeInstitution(actor, institutionId, 'viewer');

    const { data, error } = await getSupabaseAdmin()
      .from('institution_config')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: `No configuration for '${institutionId}'.` }, { status: 404 });
    }

    // Report the caller's role so the UI can disable controls it cannot use,
    // rather than offering them and failing on save.
    return NextResponse.json({ config: data, role, institutionId });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await authenticate(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a JSON object body.' }, { status: 400 });
    }

    const { institutionId, config } = body as { institutionId?: unknown; config?: unknown };
    if (typeof institutionId !== 'string' || !institutionId) {
      return NextResponse.json({ error: 'institutionId is required.' }, { status: 400 });
    }

    const role = await authorizeInstitution(actor, institutionId, 'operator');

    const { patch, rejected, invalid } = validateConfigPatch(config, role);

    // Refuse the whole request rather than applying the acceptable subset. A
    // partial apply that returns 200 tells the caller their change landed when
    // some of it did not.
    if (rejected.length || invalid.length) {
      return NextResponse.json(
        {
          error: 'Request contained fields that are not writable at your role, unknown, or of the wrong type.',
          rejected,
          invalid,
          role,
        },
        { status: 400 }
      );
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No writable fields supplied.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // `frozen_at` / `frozen_by` are server-managed so the freeze record cannot
    // be backdated or attributed to someone else by the caller. Stamped here,
    // on the transition, from the verified actor.
    const freezeStamp =
      typeof patch.frozen === 'boolean'
        ? patch.frozen
          ? { frozen_at: now, frozen_by: actor.label }
          : { frozen_at: null, frozen_by: null }
        : {};

    const { data, error } = await getSupabaseAdmin()
      .from('institution_config')
      .update({
        ...patch,
        ...freezeStamp,
        // Audit columns come from the verified actor, never from the request.
        updated_at: now,
        updated_by: actor.label,
      })
      .eq('institution_id', institutionId)
      .select('institution_id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // `.update()` on a non-existent row succeeds and affects nothing. Without
    // this check the caller gets a 200 for a write that never happened.
    if (!data) {
      return NextResponse.json({ error: `No configuration for '${institutionId}'.` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      institutionId,
      updatedFields: Object.keys(patch),
      updatedBy: actor.label,
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
