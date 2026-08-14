// lib/trustshell/identity/capability.ts
//
// The attenuation algebra. A delegation may only ever NARROW authority — this
// file is where that is decided, and it fails closed on anything it cannot
// prove is a narrowing.
//
// This is the piece sub-agent spawning depends on. When an agent spawns a
// worker, the worker's authority must be a strict subset of its parent's, and
// the check has to be mechanical rather than a matter of the parent behaving.
// A parent that could grant `pay:*` while holding only `pay:usdc` is a
// privilege-escalation primitive wearing a delegation costume.
//
// SYNTAX. A capability is colon-segmented, optionally ending in a `*` wildcard:
//
//   pay:usdc:mainnet     concrete
//   pay:usdc:*           any network, under pay:usdc
//   pay:*                anything under pay
//   *                    everything (only ever held by a root grant)
//
// A `*` is only a wildcard as a WHOLE final segment. `pay:usd*` is a literal
// segment named `usd*` and matches nothing else — prefix matching inside a
// segment would make `pay:usd*` silently cover `pay:usdt`, which is a different
// asset. Segment-wise matching keeps the blast radius of a typo to zero.

/** Parsed once so the matching rules live in one place. */
function segments(cap: string): string[] {
  return cap.split(':');
}

/**
 * Does `parent` authorize everything `child` authorizes?
 *
 * Fails closed: anything malformed, empty, or not provably narrower returns
 * false. A permission check that throws on bad input tends to get wrapped in a
 * try/catch that returns `true` on the error path.
 */
export function permits(parent: string, child: string): boolean {
  if (!parent || !child) return false;

  const p = segments(parent);
  const c = segments(child);

  for (let i = 0; i < p.length; i++) {
    // A trailing wildcard covers this segment and every segment after it.
    if (p[i] === '*') return i === p.length - 1;
    // Parent is more specific than child: child would reach further. Denied.
    if (i >= c.length) return false;
    if (p[i] !== c[i]) return false;
  }

  // Parent matched segment-for-segment. Equal length means identical; a longer
  // child is narrower (pay:usdc permits pay:usdc:mainnet).
  return c.length >= p.length;
}

/** Is every capability in `child` permitted by some capability in `parent`? */
export function isAttenuationOf(child: string[], parent: string[]): boolean {
  // An empty child set is a valid attenuation: delegating nothing is the
  // narrowest possible grant, and it verifies as authorizing nothing.
  return child.every((c) => parent.some((p) => permits(p, c)));
}

/** The capabilities of `requested` that `held` actually covers. */
export function intersect(held: string[], requested: string[]): string[] {
  return requested.filter((r) => held.some((h) => permits(h, r)));
}

/** Capabilities in `requested` that `held` does NOT cover. Empty means fully covered. */
export function excess(held: string[], requested: string[]): string[] {
  return requested.filter((r) => !held.some((h) => permits(h, r)));
}
