// lib/trustshell/priorwork/open-index.ts
//
// The OPEN list of PRIOR-WORK-INDEX.md, made machine-readable.
//
// ZERO IMPORTS so `check:open-work` can compile and assert it standalone.
//
// =============================================================================
// THE DAY THIS COST
// =============================================================================
//
// On 2026-08-16 an agent (me) spent most of a session establishing why HAL
// stopped on 2026-07-17 at 22:18 UTC. It was already root-caused on 2026-08-15,
// by another lane, and filed as an OPEN entry owned by Sean:
//
//   | **HAL volume stopped 2026-07-17 22:18 UTC — the Trinity fleet is DOWN on
//     Railway, and still is** | **Sean** (redeploy) | **ROOT-CAUSED 2026-08-15
//     ... Ruled out by evidence: pg_cron, the DB, global_pause, an app crash.
//     NOT CHECKED: why Railway stopped the containers** |
//
// The prior entry was better than the re-derivation: it ruled out four
// candidates by evidence and flagged a trap (the alerting agents have flapped
// since 2026-05-14, so reading them as the cause dates the outage two months
// early) that the re-derivation walked into twice.
//
// CLAUDE.md's first line is "FIRST: read docs/PRIOR-WORK-INDEX.md". The index's
// own header says its purpose is "stop agents redoing work that is already
// done". I had edited that file the previous day and not read the rest of it.
//
// WHY EXHORTATION DOES NOT FIX THIS. It has been tried. The instruction is in
// CLAUDE.md, in the index header, and in a numbered protocol at the top of the
// index. `check:prior-work` already enforces the file's OTHER halves — no new
// doc may cite a retracted number, every doc must be indexed. It does not, and
// structurally cannot, verify that an agent READ an open entry before working
// next to it. That is the half this closes.
//
// =============================================================================
// SCOPE IS OPT-IN, DELIBERATELY
// =============================================================================
//
// Only entries carrying an explicit `[scope: …]` marker participate. An entry
// without one is advisory and matches nothing.
//
// That is a real decision, not laziness. A matcher that guessed which entries
// relate to a diff would produce false positives, and a gate that cries wolf is
// a gate people route around — which is exactly how `check:prior-work` ended up
// enforcing only the mechanical half. Adoption is incremental: an entry starts
// advisory and becomes enforced the moment somebody writes down what it covers.

export interface OpenEntry {
  /** Stable slug derived from the item text; what a commit cites. */
  slug: string;
  /** The item cell, markdown stripped. */
  item: string;
  /** The owner cell, markdown stripped. */
  owner: string;
  /** The note cell, verbatim — this is what the gate prints, so it must be read. */
  note: string;
  /**
   * Paths, table names or keywords this entry covers.
   * Empty means advisory: the entry participates in `why:open` lookups but can
   * never fail a build.
   */
  scope: string[];
}

/** `[scope: a, b/c/, d]` anywhere in a cell. */
const SCOPE_RE = /\[scope:\s*([^\]]+)\]/i;

/**
 * Slugify an item cell into something a commit message can cite.
 *
 * Deliberately lossy and stable: lowercase, alphanumerics and hyphens, capped.
 * A slug that changed whenever somebody reworded a row would silently stop
 * matching the commits that cite it, and the gate would go quiet — failing open,
 * which is the one direction it must never fail.
 */
export function slugify(item: string): string {
  return item
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

function stripMarkdown(cell: string): string {
  return cell.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/**
 * Parse the `## OPEN — and who owns it` table.
 *
 * Reads only that section. The CLOSED and RETRACTED tables have the same shape
 * and must NOT be picked up: closed work is meant to be built on, and retracted
 * figures are governed by `check:prior-work` instead.
 */
export function parseOpenEntries(markdown: string): OpenEntry[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^##\s+OPEN\b/i.test(l));
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }

  const out: OpenEntry[] = [];
  for (const line of lines.slice(start + 1, end)) {
    if (!line.trim().startsWith('|')) continue;
    // Header and separator rows.
    if (/^\|\s*item\s*\|/i.test(line)) continue;
    if (/^\|[\s:|-]+\|$/.test(line.trim())) continue;

    const cells = line.split('|').slice(1, -1);
    if (cells.length < 3) continue;

    const item = stripMarkdown(cells[0]);
    if (!item) continue;
    const owner = stripMarkdown(cells[1]);
    const note = cells.slice(2).join('|').trim();

    const m = SCOPE_RE.exec(note);
    const scope = m
      ? m[1].split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    out.push({ slug: slugify(item), item, owner, note, scope });
  }
  return out;
}

export interface ChangeSet {
  /** Repo-relative paths changed on this branch. */
  paths: string[];
  /** The diff text, for matching table names and keywords. */
  diffText: string;
}

/**
 * Does one scope token cover this change?
 *
 * A token ending in `/` is a path prefix. Anything else matches either a path
 * substring or a whole word in the diff text.
 */
export function scopeMatches(token: string, change: ChangeSet): boolean {
  if (token.endsWith('/')) {
    return change.paths.some((p) => p.startsWith(token));
  }
  if (change.paths.some((p) => p.includes(token))) return true;
  // Whole-word, so `repid_events` does not match `trinity_repid_events` and
  // send somebody to the wrong entry — the same near-name trap the decoy gate
  // exists for.
  const word = new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  return word.test(change.diffText);
}

/** Entries whose scope this change touches. Advisory entries never match. */
export function entriesTouched(entries: OpenEntry[], change: ChangeSet): OpenEntry[] {
  return entries.filter(
    (e) => e.scope.length > 0 && e.scope.some((t) => scopeMatches(t, change))
  );
}

/**
 * Has the author acknowledged the entry?
 *
 * Two ways, and both are evidence of having read it:
 *
 *   - `PRIOR-WORK: <slug>` in a commit message on the branch. An explicit,
 *     greppable citation.
 *   - the entry's own row edited in this diff. If you touched the open item you
 *     were supposed to know about, updating what it says IS the acknowledgement,
 *     and it keeps the index current at the moment the knowledge exists rather
 *     than at the end when nobody remembers.
 */
export function isAcknowledged(
  entry: OpenEntry,
  commitMessages: string,
  indexDiff: string
): boolean {
  const cited = new RegExp(`PRIOR-WORK:\\s*${entry.slug}(?![\\w-])`, 'i').test(commitMessages);
  if (cited) return true;

  // The row itself changed — match on a distinctive span of the item text.
  //
  // BOTH SIDES ARE MARKDOWN-STRIPPED. The first version compared the stripped
  // item against the RAW diff, so any entry whose title contains backticks or
  // bold never matched its own edit. It fired on its author within minutes of
  // being written — "Task key on `repid_score_events`" — reporting an
  // unacknowledged entry that had in fact just been edited. A gate that cries
  // wolf is a gate people route around, which is precisely how check:prior-work
  // came to enforce only its mechanical half.
  const probe = entry.item.slice(0, 40);
  if (probe.length === 0) return false;
  return stripMarkdown(indexDiff).includes(probe);
}

export interface Verdict {
  entry: OpenEntry;
  matchedOn: string[];
  acknowledged: boolean;
}

export function assessChange(
  entries: OpenEntry[],
  change: ChangeSet,
  commitMessages: string,
  indexDiff: string
): Verdict[] {
  return entriesTouched(entries, change).map((entry) => ({
    entry,
    matchedOn: entry.scope.filter((t) => scopeMatches(t, change)),
    acknowledged: isAcknowledged(entry, commitMessages, indexDiff),
  }));
}
