// lib/auth.ts — the trust boundary for mutating API routes.
//
// Every route under app/api holds SUPABASE_SECRET_KEY and therefore bypasses
// RLS. That is deliberate (see app/api/CLAUDE.md), but it means a route with no
// authorization check is an unauthenticated write with full table access. That
// was literally true of `POST /api/trustrails/settings`, which took an
// institution_id from the request body and spread the body into `.update()`.
//
// Two principal types are accepted, and nothing else:
//
//   user    — a Supabase Auth session. The client sends the access token as
//             `Authorization: Bearer …`; we verify it against the auth server
//             rather than decoding it locally, so revocation takes effect.
//   service — a shared secret in `x-internal-secret`, for setup scripts and
//             server-to-server calls that have no user session.
//
// Both fail closed. A missing INTERNAL_ROUTE_SECRET disables the service path
// entirely rather than accepting every caller, which is how an "internal" route
// stays open in exactly the environment where it matters.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type InstitutionRole = 'viewer' | 'operator' | 'owner';

// Ordered, least to most privileged. A required role is satisfied by any role
// at or above it.
const ROLE_RANK: Record<InstitutionRole, number> = {
  viewer: 1,
  operator: 2,
  owner: 3,
};

export type Actor =
  | { type: 'user'; userId: string; email: string | null; label: string }
  | { type: 'service'; label: string };

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Resolve the caller. Throws AuthError if no valid principal is present.
 *
 * Never falls back to an anonymous or default identity — an unauthenticated
 * request to a mutating route is an error, not a guest.
 */
export async function authenticate(req: NextRequest): Promise<Actor> {
  const internalSecret = req.headers.get('x-internal-secret');
  if (internalSecret) {
    const expected = process.env.INTERNAL_ROUTE_SECRET;
    if (!expected) {
      throw new AuthError(503, 'INTERNAL_ROUTE_SECRET is not configured; the service path is disabled.');
    }
    if (internalSecret !== expected) {
      throw new AuthError(401, 'Invalid internal secret.');
    }
    return { type: 'service', label: 'service:internal' };
  }

  const authorization = req.headers.get('authorization');
  const token = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;

  if (!token) {
    throw new AuthError(401, 'Authentication required. Send a Supabase access token as `Authorization: Bearer …`.');
  }

  // Verify against the auth server rather than decoding locally: a locally
  // decoded JWT still validates after the user is deleted or the session is
  // revoked.
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError(401, 'Invalid or expired session.');
  }

  return {
    type: 'user',
    userId: data.user.id,
    email: data.user.email ?? null,
    label: data.user.email ?? `user:${data.user.id}`,
  };
}

/**
 * Assert the actor may act on `institutionId` at `required` role or above.
 *
 * The service principal is intentionally unscoped — it is the setup/automation
 * path and holds a secret that is already equivalent to full access. User
 * principals are scoped by an explicit institution_members row; absence of a
 * row is a denial, not a default.
 */
export async function authorizeInstitution(
  actor: Actor,
  institutionId: string,
  required: InstitutionRole
): Promise<InstitutionRole> {
  if (actor.type === 'service') return 'owner';

  const { data, error } = await getSupabaseAdmin()
    .from('institution_members')
    .select('role')
    .eq('user_id', actor.userId)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (error) {
    // A lookup that could not run is not permission to proceed. This also
    // covers the case where the migration has not been applied yet.
    throw new AuthError(
      503,
      `Could not verify institution membership: ${error.message}. ` +
        'Has supabase/migrations/20260812120000_institution_members.sql been applied?'
    );
  }

  const role = data?.role as InstitutionRole | undefined;
  if (!role) {
    // Deliberately does not distinguish "no such institution" from "no
    // membership" — that difference is itself information about which
    // institutions exist.
    throw new AuthError(403, `No access to institution '${institutionId}'.`);
  }

  if (ROLE_RANK[role] < ROLE_RANK[required]) {
    throw new AuthError(403, `Requires '${required}' on '${institutionId}'; you have '${role}'.`);
  }

  return role;
}

/** Institutions this actor can see, for populating a picker. */
export async function listInstitutions(actor: Actor): Promise<Array<{ institutionId: string; role: InstitutionRole }>> {
  if (actor.type === 'service') {
    const { data } = await getSupabaseAdmin().from('institution_config').select('institution_id');
    return (data ?? []).map((r: { institution_id: string }) => ({
      institutionId: r.institution_id,
      role: 'owner' as const,
    }));
  }

  const { data, error } = await getSupabaseAdmin()
    .from('institution_members')
    .select('institution_id, role')
    .eq('user_id', actor.userId);

  if (error) throw new AuthError(503, `Could not list institutions: ${error.message}`);

  return (data ?? []).map((r: { institution_id: string; role: InstitutionRole }) => ({
    institutionId: r.institution_id,
    role: r.role,
  }));
}

/** Turn an AuthError into a response; rethrow anything else. */
export function authErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}
