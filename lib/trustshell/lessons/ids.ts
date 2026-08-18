// lib/trustshell/lessons/ids.ts — are the failure log's own IDs unambiguous?
//
// WHY THIS EXISTS.
//
// `LESSONS.md` labels each failure with a short ID — `A16`, `S1`, `D4` — and
// the rest of the repo cites them by that ID alone. `CLAUDE.md` cites two.
// `scripts/mutations.mjs` cites one, inside the text a reviewer reads to decide
// whether a mutation is worth keeping. The ID is the whole reference: there is
// no line number, no link, no title.
//
// On 2026-08-16 the file contained **two `## A19` headings and two `## A20`
// headings** — one pair dated 2026-08-15, one dated 2026-08-16, on entirely
// unrelated failures. Three live citations pointed at those tokens, and two of
// them (in `docs/COMPOSITION-EXPERIMENTS-2026-08-15.md`) meant the older entry
// while the third (in `scripts/mutations.mjs`) meant the newer one. Following
// any of them lands on whichever heading you happen to scroll to first.
//
// That is the same defect the repo already has a rule against, applied to the
// file that records the rule. `CLAUDE.md` says a matching name is not evidence,
// after `hyperdag-org` and `trustrails-dev` each produced a wrong finding by
// name-matching a thing that was not the thing. `LESSONS A12` is *"the whole
// dashboard died because two components agreed on a name."* The failure log had
// been carrying the identical shape internally for a day.
//
// WHAT MAKES THIS CHEAP TO GET WRONG BY HAND. Nobody adds a duplicate ID on
// purpose. It happens because two sessions on the same day each append "the
// next lesson" after reading a stale copy of the file, and neither diff shows
// the other's heading. Reading your own diff cannot catch it — both halves are
// individually correct. Only a scan of the whole file can.
//
// ── SCOPE: WHAT THIS MODULE DELIBERATELY DOES NOT DO ────────────────────────
//
// It does NOT require contiguous numbering. `A1`–`A7` are inline bold labels
// inside dated session sections, `A8`–`A10` are `###`, `A11`+ are `##`; the S
// and D series are sparse. Demanding a dense sequence would fail the file as it
// correctly stands, and a check that is wrong on the current tree gets disabled
// rather than fixed.
//
// It does NOT verify that a citation's *meaning* matches the entry — only that
// the ID resolves to exactly one definition. Nothing mechanical can check the
// former, and claiming to would be the house defect: reporting a verification
// that was never performed.

/** Where an ID is defined, for an error message a human can act on. */
export interface LessonDef {
  /** The bare ID, e.g. `A19`. Series letter is preserved: `A19` ≠ `S19`. */
  id: string;
  /** 1-based line in LESSONS.md. */
  line: number;
  /** The heading or label text, so a duplicate report shows what collided. */
  title: string;
}

export interface LessonCitation {
  id: string;
  /** Repo-relative path of the citing file. */
  file: string;
  line: number;
}

/**
 * A heading definition: `## A19 — …`, `### A8 — …`.
 *
 * Anchored to line start so a heading quoted inside a fenced block or a table
 * cell is not read as a definition.
 */
const HEADING_DEF = /^#{2,4}\s+([A-Z])(\d+)\s*[—–-]\s*(.*)$/;

/**
 * An inline label definition: `**A4. Asserted a credential was disabled…**`.
 *
 * This is the form the 2026-08-12 and 2026-08-13 sections use, and `CLAUDE.md`
 * cites two of them (`A4`, `S1`), so they are real definitions and not prose.
 * The trailing period is required: it is what separates a label from an ordinary
 * bolded mention of an ID in running text.
 */
const INLINE_DEF = /\*\*([A-Z])(\d+)\.\s+([^*]*)\*\*/g;

/**
 * A citation: the literal token `LESSONS A19`.
 *
 * Requiring the `LESSONS ` prefix is what keeps this from matching every
 * identifier in the repo that happens to look like a series letter and a
 * number — `A4` paper sizes, `S3` buckets, `D4` dice. The prefix is also the
 * form every existing citation already uses, so nothing had to be rewritten to
 * make them findable.
 */
const CITATION = /\bLESSONS\s+([A-Z])(\d+)\b/g;

/** Parse every ID definition out of the failure log. */
export function parseLessonDefs(markdown: string): LessonDef[] {
  const defs: LessonDef[] = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const heading = HEADING_DEF.exec(line);
    if (heading) {
      defs.push({ id: `${heading[1]}${heading[2]}`, line: i + 1, title: heading[3].trim() });
      continue;
    }

    // A heading is never also an inline label, hence the `continue` above.
    INLINE_DEF.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_DEF.exec(line)) !== null) {
      defs.push({ id: `${m[1]}${m[2]}`, line: i + 1, title: m[3].trim() });
    }
  }

  return defs;
}

/** Parse `LESSONS <id>` citations out of one file's text. */
export function parseCitations(text: string, file: string): LessonCitation[] {
  const out: LessonCitation[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    CITATION.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITATION.exec(lines[i])) !== null) {
      out.push({ id: `${m[1]}${m[2]}`, file, line: i + 1 });
    }
  }

  return out;
}

/**
 * IDs defined more than once, with every definition site.
 *
 * Returned sorted by ID so the report is stable across runs — an unstable
 * report reads as churn and gets skimmed.
 */
export function duplicateDefs(defs: LessonDef[]): Array<{ id: string; sites: LessonDef[] }> {
  const byId = new Map<string, LessonDef[]>();
  for (const d of defs) {
    const existing = byId.get(d.id);
    if (existing) existing.push(d);
    else byId.set(d.id, [d]);
  }

  const dupes: Array<{ id: string; sites: LessonDef[] }> = [];
  for (const [id, sites] of byId) {
    if (sites.length > 1) dupes.push({ id, sites });
  }

  return dupes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Citations whose ID has no definition at all.
 *
 * A dangling citation and an ambiguous one are different failures and are
 * reported separately: the first means the entry was renamed or never written,
 * the second means following the reference is a coin flip. Collapsing them into
 * one count would hide which one you have.
 */
export function danglingCitations(
  citations: LessonCitation[],
  defs: LessonDef[]
): LessonCitation[] {
  const known = new Set(defs.map((d) => d.id));
  return citations.filter((c) => !known.has(c.id));
}

/** Citations whose ID resolves to more than one definition. */
export function ambiguousCitations(
  citations: LessonCitation[],
  defs: LessonDef[]
): LessonCitation[] {
  const dupeIds = new Set(duplicateDefs(defs).map((d) => d.id));
  return citations.filter((c) => dupeIds.has(c.id));
}
