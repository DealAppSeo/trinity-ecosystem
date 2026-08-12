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
// The legacy service_role JWT is NOT known to be retired. An earlier comment
// here asserted it was disabled; that was never measured, and secret keys are
// not readable through any API, so it cannot be checked from inside the app. A
// copy of one such JWT for this project sits in git history (`.env.local`,
// tracked 2026-04-17 to 2026-07-25) with an `exp` in 2035.
//
// "Disabled" would not settle it either. Supabase's disable-legacy-API-keys
// switch is reversible and does not change the token — it is signed by the
// project's JWT secret, which can no longer be rotated. Re-enabling legacy keys
// makes that history copy work again. Only migrating to JWT signing keys and
// revoking the old one retires it. So a legacy JWT in the environment is
// treated as a live credential here — hence the warning below rather than a
// silent accept. `npm run check:legacy-key` measures the current state from a
// machine that can reach the API; docs/KEY-ROTATION.md has the remediation.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const URL_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const;

const KEY_VARS = [
  'SUPABASE_SECRET_KEY',        // current: sb_secret_…
  'SUPABASE_SERVICE_ROLE_KEY',  // legacy JWT — status unverified, see above
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

  // Observe, do not block. Refusing a legacy key would take down any host still
  // configured with one, and we have no evidence such a host does not exist —
  // that is exactly the unverified claim this file used to make. Say it loudly
  // once per process instead, so the condition is visible in logs.
  if (isLegacyServiceRoleJwt(key.value) && !warnedLegacy) {
    warnedLegacy = true;
    console.warn(
      `[supabase-admin] ${key.name} holds a legacy service_role JWT, not an ` +
        `sb_secret_… key. It bypasses RLS, and a copy of one such JWT for this ` +
        `project is recoverable from git history. Rotate in Supabase → Settings ` +
        `→ API Keys, then set SUPABASE_SECRET_KEY and unset the legacy names. ` +
        `See docs/KEY-ROTATION.md.`
    );
  }

  client = createClient(url, key.value);
  return client;
}
