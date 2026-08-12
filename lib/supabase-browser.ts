// Lazily-constructed browser Supabase client for client components.
//
// These components are still server-rendered during `next build`, so a client
// built at module scope runs on the server at prerender time and fails the
// build when the key is absent. Deferring construction to first use — inside
// an effect — keeps the prerender pass clean.
//
// KEY NAMING. This project (AITrinitySymphony, ref qnnpjhlxljtqyigedwkb) has
// moved to Supabase's newer API keys: the legacy `anon` JWT is DISABLED, and
// the browser key is a publishable key (sb_publishable_...). Reading only
// NEXT_PUBLIC_SUPABASE_ANON_KEY would therefore find nothing, or find a key
// the API no longer accepts. Several names are accepted so the app works
// whichever one is configured, newest first.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Each reference must be a literal `process.env.NEXT_PUBLIC_*`. Next inlines
// these at build time by static analysis, so a computed lookup such as
// process.env[name] would be undefined in the browser bundle. That is why
// this is a list of literals rather than a loop over key names.
function readBrowserKey(): { name: string; value: string } | null {
  const candidates: Array<[string, string | undefined]> = [
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ];
  for (const [name, value] of candidates) {
    if (value) return { name, value };
  }
  return null;
}

export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = readBrowserKey();

  if (!url) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL.'
    );
  }
  if (!key) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(an sb_publishable_… key). NEXT_PUBLIC_SUPABASE_ANON_KEY is also read, ' +
        'but the legacy anon key is disabled on this project.'
    );
  }

  client = createClient(url, key.value);
  return client;
}
