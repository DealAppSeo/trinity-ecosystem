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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const URL_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const;

const KEY_VARS = [
  'SUPABASE_SECRET_KEY',        // current: sb_secret_…
  'SUPABASE_SERVICE_ROLE_KEY',  // legacy JWT, disabled on this project
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_KEY',
] as const;

function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = firstSet(URL_VARS);
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
        `Also read, in order: ${KEY_VARS.join(', ')}. The legacy service_role ` +
        `key is disabled on this project.`
    );
  }

  client = createClient(url, key);
  return client;
}
