'use client';

// lib/api-fetch.ts
//
// Browser-side fetch that attaches the Supabase access token.
//
// The API routes verify a bearer token rather than a cookie, so there is no
// SSR cookie plumbing and no extra dependency — client components call these
// helpers and the session comes from supabase-js, which already persists and
// refreshes it.

import { getSupabaseBrowser } from '@/lib/supabase-browser';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** True when the caller is signed out or the session expired. */
  get isUnauthenticated() {
    return this.status === 401;
  }
  /** True when signed in but not permitted for this institution or role. */
  get isForbidden() {
    return this.status === 403;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch JSON from an authenticated API route.
 *
 * Throws ApiError on a non-2xx rather than returning a body the caller has to
 * inspect — a component that renders `undefined` because it ignored a 403 shows
 * an empty state that is indistinguishable from "no data".
 */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const body = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }

  return body as T;
}

export function apiPost<T = unknown>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}
