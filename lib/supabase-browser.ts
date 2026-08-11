// Lazily-constructed anon-key Supabase client for client components.
//
// These components are still server-rendered during `next build`, so a client
// built at module scope runs on the server at prerender time and fails the
// build when the anon key is absent. Deferring construction to first use —
// inside an effect — keeps the prerender pass clean.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;

  // Next inlines NEXT_PUBLIC_* at build time, so these are literals in the
  // browser bundle; reading them inside a function does not change that.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL.'
    );
  }
  if (!key) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  client = createClient(url, key);
  return client;
}
