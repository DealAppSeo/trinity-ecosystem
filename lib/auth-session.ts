// lib/auth-session.ts
//
// The sign-in / sign-out state machine, as pure functions.
//
// WHY IT LEFT THE COMPONENT. `app/login/page.tsx` had a real defect — sign-out
// discarded its result and cleared the UI unconditionally, so a FAILED sign-out
// rendered "signed out" over a session that was still live. The fix was three
// lines. Gating it was impossible: every check suite in this repo drives a pure
// module under `lib/`, there is no React harness, and a client component is
// exactly the thing none of them can see.
//
// So the fix shipped ungated, which is the state this repo keeps paying for. A
// transition that decides whether a user believes they are signed out belongs
// somewhere a test can reach it. These functions are that place; the component
// keeps the rendering and owns none of the decisions.
//
// ZERO IMPORTS, including from `@supabase/supabase-js`. The inputs are the
// SHAPES supabase-js returns, restated structurally, so this module compiles and
// runs standalone. Importing the client would drag a browser dependency into a
// suite that only wants to ask "what should the UI say".
//
// ── THE RULE ALL THREE TRANSITIONS SHARE ────────────────────────────────────
//
// **On failure, keep the state that is TRUE, not the state that is tidy.** A
// failed sign-out leaves you signed IN; the reassuring reading is the wrong one
// and it is the one a shared machine punishes. A failed session probe means we
// do not know, which is not the same as signed out.

/** What supabase-js hands back. Restated structurally — see the header. */
export interface AuthResult {
  error?: { message: string } | null;
}

export interface SignInResult extends AuthResult {
  data?: { user?: { email?: string | null } | null } | null;
}

export interface SessionProbeResult extends AuthResult {
  data?: { session?: { user?: { email?: string | null } | null } | null } | null;
}

/** `working` exists so the submit button can disable; it is never a resting state. */
export type SessionStatus = 'idle' | 'working' | 'signed-in';

export interface SessionView {
  status: SessionStatus;
  /** The signed-in address, or null. Never a placeholder. */
  email: string | null;
  /** Non-null whenever the last transition failed. */
  error: string | null;
}

export const SIGNED_OUT: Readonly<SessionView> = Object.freeze({
  status: 'idle',
  email: null,
  error: null,
});

/**
 * The initial probe on mount.
 *
 * A THROWN probe is not a signed-out user. A missing or misconfigured Supabase
 * key throws here, and rendering a login form that cannot possibly work — with
 * no error — is how a broken deployment looks identical to a logged-out one.
 */
export function applySessionProbe(result: SessionProbeResult): SessionView {
  if (result.error) {
    return { status: 'idle', email: null, error: result.error.message };
  }
  const email = result.data?.session?.user?.email ?? null;
  return email ? { status: 'signed-in', email, error: null } : SIGNED_OUT;
}

/**
 * The result of submitting credentials.
 *
 * Falls back to the SUBMITTED address when the response omits one: the sign-in
 * succeeded, so claiming "signed in as null" would be a worse lie than echoing
 * what the user typed.
 */
export function applySignInResult(result: SignInResult, submittedEmail: string): SessionView {
  if (result.error) {
    return { status: 'idle', email: null, error: result.error.message };
  }
  const email = result.data?.user?.email ?? submittedEmail;
  return { status: 'signed-in', email, error: null };
}

/**
 * The result of signing out — the transition that was wrong.
 *
 * On failure the previous view is RETURNED UNCHANGED except for the error, so
 * the UI keeps saying "signed in as …" because that is still true. Clearing it
 * would be the tidy answer and the false one.
 */
export function applySignOutResult(result: AuthResult, current: SessionView): SessionView {
  if (result.error) {
    return {
      ...current,
      error: `Sign-out failed, you are still signed in: ${result.error.message}`,
    };
  }
  return SIGNED_OUT;
}

/**
 * Is this view safe to walk away from?
 *
 * Named rather than left as `status !== 'signed-in'` at a call site, because the
 * failed-sign-out case is precisely when those two differ: status is
 * `signed-in`, an error is present, and the honest answer is NO.
 */
export function isSafelySignedOut(view: SessionView): boolean {
  return view.status === 'idle' && view.email === null && view.error === null;
}
