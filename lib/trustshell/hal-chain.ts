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
   * Links that COULD have been checked inside this window and were not.
   *
   * Excludes the first entry's inbound link, which points at a predecessor
   * outside the window — that is a boundary, not a gap. Counting it made
   * VERIFIED unreachable, since every window has exactly one, which is the same
   * never-opening-gate defect this codebase just found in the RepID curve. Found
   * here by the suite's own 'supplying the formula turns the chain VERIFIED'
   * assertion, which is why that assertion exists.
   */
  linksNotChecked: number;
  /** True when the first entry's inbound link was left unexamined by construction. */
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
 * DRIVEN OVER LIVE ROWS 2026-08-16, not only over fixtures.
 *
 * Until then every assertion about this file rested on entries its own author
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
 * The last line is why this note exists. VERIFIED being REACHABLE is the defect
 * this file already fixed once — the window's first entry has no predecessor
 * inside it, and counting that as a gap made the outcome impossible — and it was
 * fixed against fixtures. It is now demonstrated on production rows.
 *
 * The middle two confirm the distinction that is easiest to get wrong:
 * `windowStartUnverifiable` is FALSE on the full window, where the first row's
 * link is genuinely null (adoption before chaining began), and TRUE on the tail,
 * where the first row's link points at a predecessor outside the window (a
 * boundary). An absent link and an unexaminable one are different facts.
 *
 * WHAT THIS DOES NOT SHOW: the live chain is still NOT_CHECKED. The oracle above
 * was handed each entry's stored successor link, so it proves the verifier can
 * reach VERIFIED — it proves nothing about whether the real links are correct.
 * That still needs the producer's formula, which is not in this repository.
 */
export const LIVE_RUN_2026_08_16 =
  'verifyHalChain was driven over 16 real hal_classifications rows spanning the cutover: ' +
  'NOT_CHECKED without a hasher, FAILED (9 link_mismatch) under a wrong hasher, VERIFIED 9/9 ' +
  'under an oracle. VERIFIED is reachable on production rows, not only on fixtures. The live ' +
  'chain remains unverified: the oracle proves the verifier works, not that the links are right.';

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
      if (!Number.isNaN(at) && at >= cutover) {
        defects.push({
          kind: 'missing_link_after_cutover',
          entryId: entry.id,
          detail:
            `entry has no previous_entry_hash but was written at ${entry.created_at}, after ` +
            `chaining began at ${new Date(cutover).toISOString()} — this is a break, not adoption`,
        });
      }
      linksNotChecked += 1;
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
