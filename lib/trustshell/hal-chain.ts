// lib/trustshell/hal-chain.ts
//
// Verifying the HAL classification chain — the half that can be checked without
// the producer's formula, and an honest NOT_CHECKED for the half that cannot.
//
// ZERO IMPORTS, like `hal-receipt.ts` beside it and for the same reason.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `hal_classifications.previous_entry_hash` has been written since
// **2026-06-02** and is carried into every compliance receipt by
// `halReceiptRow`. **Nothing has ever verified it.** A hash chain nobody walks
// is a field, not a chain — the same shape as the `seenNonces` set this repo
// once read but never wrote, and as the vault gate resting on a boolean nobody
// produced evidence for. NORTH-STAR puts it more bluntly: a HAL run produced is
// a proof of nothing.
//
// ── WHAT WAS MEASURED BEFORE THIS WAS WRITTEN ───────────────────────────────
//
// Against the live table, 147,703 rows:
//
//   * 102,934 rows carry a link, and **all 102,934 links are distinct** — no
//     fork, no reuse.
//   * Chaining began 2026-06-02 00:24:19Z. The last unchained row is
//     2026-06-02 00:23:44Z, **35 seconds earlier**, and there are ZERO
//     unchained rows after the cutover. The 44,769 null links are the
//     pre-chaining era, not breaks in a live chain.
//
// So the chain's STRUCTURE is sound and now has something that says so.
//
// ── WHAT CANNOT BE VERIFIED, AND WHY THAT IS THE FINDING ────────────────────
//
// **The table stores no entry's own hash — only its predecessor's.** To check
// link N you must recompute entry N-1's hash, which requires the producer's
// formula. That formula lives in the Trinity fleet, not here: 568 plausible
// constructions (field subsets × separators × sha256/sha512/sha1/md5, plus
// double-hash forms) were tried against a real adjacent pair and **none
// reproduced the stored link.**
//
// That does not prove the links are wrong — the producer may hash a field this
// table does not store. It proves something narrower and worse: **the chain is
// not verifiable by anyone holding the data and this repository**, which is the
// one property a hash chain exists to provide. A tamper-evident log whose
// tamper-evidence only its author can check is a log.
//
// So `EntryHasher` is a PORT. Supply the formula and every link is checked;
// supply nothing and link verification is NOT_CHECKED — never VERIFIED, and
// never silently skipped. When the fleet lane publishes the construction, this
// file is where it plugs in, and the 102,934 existing links become checkable
// retroactively.

/** The fields a HAL row exposes for chaining. Mirrors the live table exactly. */
export interface HalChainEntry {
  id: number;
  prompt_hash: string;
  category: string | null;
  confidence: string | null;
  latency_ms: number | null;
  provider: string | null;
  model: string | null;
  /** ISO-8601. Ordering is taken from this, NOT from `id`. */
  created_at: string;
  /** Null before the 2026-06-02 cutover. */
  previous_entry_hash: string | null;
}

/**
 * Recomputes an entry's own hash — the thing the table does not store.
 *
 * SUPPLIED BY THE CALLER, because this repository does not know the formula and
 * guessing one would be worse than admitting it: a verifier that checks links
 * against an invented construction reports FAILED for a chain that is fine, and
 * a green run against a wrong formula is not achievable at all — so the failure
 * mode is a permanent false alarm that gets switched off, taking the real check
 * with it.
 */
export type EntryHasher = (entry: HalChainEntry) => string;

export type ChainOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export type ChainDefectKind =
  /** Two entries claim the same predecessor. The chain forked. */
  | 'duplicate_link'
  /** A link is missing after chaining began — a break, not adoption. */
  | 'missing_link_after_cutover'
  /** An entry names itself as its predecessor. */
  | 'self_link'
  /** Rows are not in the order their timestamps claim. */
  | 'out_of_order'
  /** The recomputed predecessor hash does not match the stored link. */
  | 'link_mismatch';

export interface ChainDefect {
  kind: ChainDefectKind;
  /** The entry the defect was found at. */
  entryId: number;
  detail: string;
}

export interface ChainVerification {
  outcome: ChainOutcome;
  entriesExamined: number;
  /** Links actually recomputed and compared. Zero when no hasher was supplied. */
  linksVerified: number;
  /**
   * Links that COULD have been checked and were not — a hasher was available in
   * principle but did not recompute this one (no hasher supplied, or it threw).
   *
   * Excludes two things that are NOT gaps, because there is nothing there to
   * check rather than something unchecked:
   *
   *   - a pre-cutover adoption link (null, dated before CHAIN_CUTOVER_ISO). Its
   *     null-ness is a structural fact the row's own timestamp already proves —
   *     it cannot be hiding a predecessor, because chaining did not exist yet.
   *   - the window's own boundary link (see `windowStartUnverifiable` below) —
   *     unexamined by construction, not checked-and-failed.
   */
  linksNotChecked: number;
  /**
   * True when the window's first entry has a REAL inbound link (chaining was
   * already live) that points at a predecessor outside the entries supplied —
   * a page of a longer chain, exactly what a truncation attack also looks like
   * from inside the window. `outcome` can never be VERIFIED while this is true:
   * the caller cannot rule out that what is missing was deleted. FALSE when the
   * window's first entry is instead a true genesis (null link, pre-cutover) —
   * there nothing was truncated away, because nothing could have been there.
   */
  windowStartUnverifiable: boolean;
  defects: readonly ChainDefect[];
  detail: string;
}

/**
 * The instant chaining began, as measured against the live table.
 *
 * A null link BEFORE this is adoption; a null link AFTER it is a break. Without
 * the boundary the verifier cannot tell those apart, and would have to treat
 * 44,769 legitimate pre-chaining rows as 44,769 defects — which is how a real
 * check gets switched off.
 */
export const CHAIN_CUTOVER_ISO = '2026-06-02T00:24:19.273292Z';

/**
 * DRIVEN OVER LIVE ROWS 2026-08-16 — SUPERSEDED, kept as history, read with
 * LIVE_RUN_2026_08_17 below.
 *
 * Until this, every assertion about this file rested on entries its own author
 * invented, and a fixture author picks the timestamp format, the null shape and
 * the id spacing that a database actually decides. A property can be true in
 * fixtures and false in production without a single test going red.
 *
 * A 16-row window of `hal_classifications` straddling the cutover instant
 * (ids 44764–44779; six unchained rows, then ten chained, the first of which is
 * the cutover row itself) was pulled through the Supabase MCP tool and passed to
 * `verifyHalChain` unmodified. The rows are NOT committed — the preflight fences
 * forbid prod rows as git fixtures — so this note records the outcome, which is
 * the part that has to survive.
 *
 *   no hasher, full window   NOT_CHECKED, 0 defects, 16 links unchecked
 *   no hasher, chained tail  NOT_CHECKED, 9 unchecked of 10 entries
 *   WRONG hasher             FAILED, 9 × link_mismatch — it does not shrug
 *   oracle hasher            VERIFIED, 9/9 links recomputed and matched
 *
 * At the time, the last line was read as the fix working: VERIFIED being
 * reachable on production rows, not only fixtures. IT WAS WRONG. The chained
 * tail's first entry (the cutover row) has a REAL link pointing at a predecessor
 * OUTSIDE this window — `windowStartUnverifiable` was TRUE for exactly this
 * VERIFIED. That is what a truncation attack looks like from the inside (delete
 * the head, present the tail — every remaining link still matches), and this run
 * proved the confusion existed on real data, not only in a fixture: the verifier
 * could not tell "the tail of a longer chain" from "the whole chain."
 *
 * The red team's HAL-001 (2026-08-16) went on to prove this was not incidental:
 * an exhaustive search found NO input reaching VERIFIED with
 * `windowStartUnverifiable === false` — every VERIFIED this function could ever
 * emit was over a window shaped exactly like the one above. Fixed 2026-08-17;
 * see LIVE_RUN_2026_08_17.
 */
export const LIVE_RUN_2026_08_16 =
  'SUPERSEDED — see LIVE_RUN_2026_08_17. verifyHalChain was driven over 16 real hal_classifications ' +
  'rows spanning the cutover: NOT_CHECKED without a hasher, FAILED (9 link_mismatch) under a wrong ' +
  'hasher, VERIFIED 9/9 under an oracle. At the time this was read as confirming the fix; it was ' +
  'actually HAL-001 reproduced live — that VERIFIED had windowStartUnverifiable=true, the exact ' +
  'shape of a truncation attack, and the red team proved no other shape of VERIFIED was reachable.';

/**
 * DRIVEN OVER LIVE ROWS 2026-08-17, after the HAL-001 fix — same honesty
 * boundary as the run above (the "oracle" is not a real hash formula; it is
 * each entry's stored successor link read back as its own hash, so a VERIFIED
 * under it proves the verifier's MECHANICS on real rows, not that the real
 * links are cryptographically correct — that still needs the producer's
 * formula, which is not in this repository).
 *
 * A wider window this time — ids 44758–44779, 22 rows (12 pre-cutover unchained,
 * 10 chained) — specifically to include the true genesis, which the narrower
 * 16-row window above did not reach far enough back to test.
 *
 *   no hasher, full window (22)         NOT_CHECKED, 0 defects, 10 unchecked
 *   no hasher, chained tail (10)        NOT_CHECKED, 9 unchecked, windowStartUnverifiable=true
 *   WRONG hasher, chained tail          FAILED, 9 × link_mismatch — still does not shrug
 *   oracle hasher, chained tail         NOT_CHECKED (was VERIFIED pre-fix) — same input as
 *                                       2026-08-16, opposite verdict: windowStartUnverifiable=true
 *                                       now correctly CAPS the outcome instead of being reported
 *                                       and ignored.
 *   oracle hasher, FULL window (22)     VERIFIED, 10/10, windowStartUnverifiable=FALSE — an
 *                                       ANCHORED VERIFIED, demonstrated live for the first time.
 *
 * The first row (no hasher, full window): 10 unchecked, not 22. The 12
 * pre-cutover null links are no longer counted as gaps — there is nothing behind
 * them to recompute, and the row's own timestamp is the proof — so only the 10
 * chained rows' links register as needing a formula that was not supplied.
 *
 * WHAT THIS STILL DOES NOT SHOW: the live chain's real links are unverified —
 * the oracle proves the verifier works, not that the links are cryptographically
 * right. That still needs the producer's formula.
 */
export const LIVE_RUN_2026_08_17 =
  'Post-fix re-run over 22 real hal_classifications rows (ids 44758-44779, a wider window than ' +
  '2026-08-16, chosen to include the true pre-cutover genesis): the SAME chained-tail input that ' +
  'read VERIFIED on 2026-08-16 now reads NOT_CHECKED (windowStartUnverifiable correctly caps it); ' +
  'the full window, including the genesis, now reaches VERIFIED 10/10 with windowStartUnverifiable ' +
  '=false — an anchored VERIFIED, demonstrated live for the first time. The real links remain ' +
  'unverified pending the producer formula; this shows the verifier now tells the two cases apart.';

/**
 * Verify a run of HAL entries.
 *
 * `entries` must be a contiguous window ordered by `created_at`. Ordering is
 * taken from the timestamp and CHECKED, not assumed — this repo has a
 * retraction from an `id desc` query that assumed id tracked time, and the same
 * assumption here would silently reorder the chain being verified.
 */
export function verifyHalChain(
  entries: readonly HalChainEntry[],
  options: { hasher?: EntryHasher; cutoverIso?: string } = {}
): ChainVerification {
  const cutover = Date.parse(options.cutoverIso ?? CHAIN_CUTOVER_ISO);
  const defects: ChainDefect[] = [];

  if (entries.length === 0) {
    return {
      outcome: 'NOT_CHECKED',
      entriesExamined: 0,
      linksVerified: 0,
      linksNotChecked: 0,
      windowStartUnverifiable: false,
      defects: [],
      detail: 'no entries were supplied, so no chain was examined. An empty window is not a clean one.',
    };
  }

  // ── ordering ─────────────────────────────────────────────────────────────
  for (let i = 1; i < entries.length; i += 1) {
    const prev = Date.parse(entries[i - 1].created_at);
    const here = Date.parse(entries[i].created_at);
    if (Number.isNaN(prev) || Number.isNaN(here)) {
      defects.push({
        kind: 'out_of_order',
        entryId: entries[i].id,
        detail: `created_at is unparseable, so this entry's position in the chain is unknown`,
      });
    } else if (here < prev) {
      defects.push({
        kind: 'out_of_order',
        entryId: entries[i].id,
        detail: `created_at ${entries[i].created_at} precedes the previous entry's ${entries[i - 1].created_at}`,
      });
    }
  }

  // ── structural checks that need no formula ───────────────────────────────
  const seenLinks = new Map<string, number>();
  let linksVerified = 0;
  let linksNotChecked = 0;
  let windowStartUnverifiable = false;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const link = entry.previous_entry_hash;
    const at = Date.parse(entry.created_at);

    if (link === null || link === undefined || link === '') {
      // Before the cutover this is adoption. After it, a live chain lost a link.
      if (Number.isNaN(at)) {
        // Can't place this entry in either era. Ordering already flags an
        // unparseable timestamp (out_of_order, below) whenever a NEIGHBOUR
        // exists to compare against — but a lone first entry has none, so this
        // is the only place a solitary bad timestamp is caught. Fall back to
        // the cautious reading: unproven, not unchecked-because-provably-fine.
        linksNotChecked += 1;
      } else if (at >= cutover) {
        defects.push({
          kind: 'missing_link_after_cutover',
          entryId: entry.id,
          detail:
            `entry has no previous_entry_hash but was written at ${entry.created_at}, after ` +
            `chaining began at ${new Date(cutover).toISOString()} — this is a break, not adoption`,
        });
        linksNotChecked += 1;
      }
      // else: PROVEN pre-cutover adoption — NOT counted as unchecked. There is
      // no predecessor to recompute, and the row's own timestamp is the proof,
      // not an assertion this verifier has to trust. Treating it as a gap is
      // what capped every genesis-anchored chain at NOT_CHECKED regardless of
      // how many real links past it all matched — the defect HAL-001 closes.
      continue;
    }

    const firstSeenAt = seenLinks.get(link);
    if (firstSeenAt !== undefined) {
      defects.push({
        kind: 'duplicate_link',
        entryId: entry.id,
        detail: `claims the same predecessor as entry ${firstSeenAt} — two entries cannot follow one`,
      });
    } else {
      seenLinks.set(link, entry.id);
    }

    // ── the link itself, only if the formula was supplied ──────────────────
    const predecessor = i > 0 ? entries[i - 1] : null;
    if (!predecessor) {
      // The window boundary. Its predecessor is outside the entries supplied,
      // so this link is unexamined by construction rather than unchecked.
      windowStartUnverifiable = true;
      continue;
    }
    if (!options.hasher) {
      linksNotChecked += 1;
      continue;
    }

    // BOTH hasher calls sit inside one guard. The self-link comparison below
    // also invokes the hasher, and having it outside meant a formula that threw
    // on one entry escaped the catch entirely — found by the suite's flaky-hasher
    // fixture, which is why that fixture uses a hasher that fails selectively
    // rather than always.
    let recomputed: string;
    let ownHash: string;
    try {
      recomputed = options.hasher(predecessor);
      ownHash = options.hasher(entry);
    } catch {
      // A hasher that threw has not told us the link is wrong.
      linksNotChecked += 1;
      continue;
    }

    if (recomputed === link) {
      linksVerified += 1;
      if (link === ownHash) {
        defects.push({
          kind: 'self_link',
          entryId: entry.id,
          detail: 'the entry names its own hash as its predecessor',
        });
      }
    } else {
      defects.push({
        kind: 'link_mismatch',
        entryId: entry.id,
        detail:
          `stored link ${link.slice(0, 16)}… does not match the recomputed hash of entry ` +
          `${predecessor.id} (${recomputed.slice(0, 16)}…)`,
      });
    }
  }

  // ── the verdict ──────────────────────────────────────────────────────────
  if (defects.length > 0) {
    return {
      outcome: 'FAILED',
      entriesExamined: entries.length,
      linksVerified,
      linksNotChecked,
      windowStartUnverifiable,
      defects,
      detail:
        `${defects.length} defect(s) across ${entries.length} entries: ` +
        defects.slice(0, 5).map((d) => `${d.kind} at ${d.entryId}`).join(', ') +
        (defects.length > 5 ? `, and ${defects.length - 5} more` : ''),
    };
  }

  if (linksVerified === 0) {
    // THE HONEST DEFAULT. Structure held, but not one link was recomputed —
    // which is what happens with no hasher, and is the state the live chain has
    // been in since 2026-06-02. Reporting VERIFIED here would be the defect
    // this whole file exists to close.
    return {
      outcome: 'NOT_CHECKED',
      entriesExamined: entries.length,
      linksVerified: 0,
      linksNotChecked,
      windowStartUnverifiable,
      defects: [],
      detail:
        `${entries.length} entries are structurally sound — ordered, no duplicate links, no ` +
        'break after the cutover — but NOT ONE LINK WAS RECOMPUTED. Structure is not integrity: ' +
        'supply an EntryHasher to check the links themselves. Until then the chain is unverified, ' +
        'not verified.',
    };
  }

  if (windowStartUnverifiable) {
    // HAL-001. Every link INSIDE this window matched, but the window's own
    // start points at a predecessor nobody showed this verifier — exactly what
    // a truncation attack looks like from the inside (delete the head, the tail
    // is still internally consistent). Reporting VERIFIED here is the defect
    // this branch exists to close: a caller gating on `outcome` alone would
    // accept a chain whose head may have been deleted. Anchor the claim instead
    // — a window that includes the true genesis (a proven pre-cutover null
    // link) never sets this flag, so it is NOT what caps that case.
    return {
      outcome: 'NOT_CHECKED',
      entriesExamined: entries.length,
      linksVerified,
      linksNotChecked,
      windowStartUnverifiable,
      defects: [],
      detail:
        `${linksVerified} link(s) recomputed and matched, but the window's start is UNANCHORED — ` +
        `its first entry's link points at a predecessor outside the entries supplied, which is ` +
        `indistinguishable from a truncated chain. VERIFIED requires a window whose start is ` +
        `provably the beginning (a pre-cutover entry with no link) or whose full history back to ` +
        `one has been supplied and checked.`,
    };
  }

  return {
    outcome: linksNotChecked > 0 ? 'NOT_CHECKED' : 'VERIFIED',
    entriesExamined: entries.length,
    linksVerified,
    linksNotChecked,
    windowStartUnverifiable,
    defects: [],
    detail:
      linksNotChecked > 0
        ? `${linksVerified} link(s) recomputed and matched, but ${linksNotChecked} could not be checked — ` +
          'a partially verified chain is not a verified one'
        : `all ${linksVerified} link(s) recomputed and matched across ${entries.length} entries`,
  };
}
