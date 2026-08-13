// Lazily-constructed server-side Supabase client.
//
// Constructing a client at module scope breaks `next build`: page-data
// collection imports every route module, so a missing key throws before any
// request is ever served. Nothing here touches the environment until the
// first call, which keeps the build free of runtime secrets.
//
// KEY NAMING. This project has moved to Supabase's newer API keys, so the
// server key is a secret key (sb_secret_...) rather than the legacy
// service_role JWT. Both are accepted, newest first, so the app works
// whichever is configured. This runs only on the server, so a computed lookup
// is fine here — unlike the browser helper, nothing needs static inlining.
//
// LEGACY KEY STATUS — SETTLED 2026-08-12, do not re-open.
//
// Legacy anon/service_role JWTs are DISABLED on this project (the dashboard
// offers "Re-enable JWT-based API keys", which only appears when they are off).
// A copy of the legacy service_role JWT is public in DealAppSeo/repid-engine's
// git history; it is INERT because the key is disabled. Not an incident, and
// there is nothing to rotate — Supabase no longer offers legacy JWT rotation.
// The one standing rule: never re-enable legacy API keys on this project.
//
// The warning below therefore fires on a MISCONFIGURATION, not a breach: if a
// legacy JWT is still sitting in this environment, that host is one re-enable
// away from depending on a dead credential. Fix the env, not the key.
// See docs/KEY-ROTATION.md.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const URL_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const;

const KEY_VARS = [
  'SUPABASE_SECRET_KEY',        // current: sb_secret_…
  'SUPABASE_SERVICE_ROLE_KEY',  // legacy JWT — disabled project-wide, see above
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_KEY',
] as const;

function firstSet(names: readonly string[]): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return { name, value };
  }
  return undefined;
}

// A legacy Supabase key is a JWT: three dot-separated base64url segments whose
// payload carries `"role":"service_role"`. A current key is an opaque
// `sb_secret_…` string. Detecting the shape is enough — we never verify the
// signature, only report which kind of credential is in use.
function isLegacyServiceRoleJwt(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3 || !key.startsWith('eyJ')) return false;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload).role === 'service_role';
  } catch {
    return false;
  }
}

let warnedLegacy = false;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = firstSet(URL_VARS)?.value;
  const key = firstSet(KEY_VARS);

  // Fail loudly and name the variable. The fallbacks this replaced pointed a
  // live client at a dummy host, so misconfiguration surfaced as confusing
  // query errors at runtime instead of as the missing credential it was.
  if (!url) {
    throw new Error(
      `Supabase is not configured: set one of ${URL_VARS.join(', ')}.`
    );
  }
  if (!key) {
    throw new Error(
      `Supabase is not configured: set SUPABASE_SECRET_KEY (an sb_secret_… key). ` +
        `Also read, in order: ${KEY_VARS.join(', ')}.`
    );
  }

  // Observe, do not block. A host configured with a legacy JWT is already
  // failing its Supabase calls (the key is disabled project-wide), so throwing
  // here would only swap one broken state for another and hide the cause. Say
  // it loudly once per process instead, so the condition is visible in logs.
  if (isLegacyServiceRoleJwt(key.value) && !warnedLegacy) {
    warnedLegacy = true;
    console.warn(
      `[supabase-admin] ${key.name} holds a legacy service_role JWT, not an ` +
        `sb_secret_… key. Legacy JWTs are DISABLED on this project, so calls ` +
        `made with it will fail — this host is misconfigured. There is nothing ` +
        `to rotate (Supabase no longer rotates legacy JWT secrets): create an ` +
        `sb_secret_… key, set SUPABASE_SECRET_KEY, and unset the legacy names. ` +
        `See docs/KEY-ROTATION.md.`
    );
  }

  client = createClient(url, key.value);
  return client;
}
