// Lazily-constructed service-role Supabase client.
//
// Constructing a client at module scope breaks `next build`: page-data
// collection imports every route module, so a missing key throws before any
// request is ever served. Nothing here touches the environment until the
// first call, which keeps the build free of runtime secrets.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  // Fail loudly and name the variable. The previous fallbacks pointed a live
  // client at a dummy host, so misconfiguration surfaced as confusing query
  // errors at runtime instead of as the missing credential it actually was.
  if (!url) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).'
    );
  }
  if (!key) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).'
    );
  }

  client = createClient(url, key);
  return client;
}
