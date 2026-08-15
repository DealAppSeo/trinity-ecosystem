// lib/trustshell/receipt/claims.ts — T0 and T1 claim checking. TrustShell M4.
//
// Spec: docs/TRUSTSHELL-V1.md §4.3. T2 (a panel judging claim against evidence)
// is deliberately absent — it is gated until its false-positive rate is
// measured, and this file does not pretend to approximate it.
//
// ============================================================================
// THE GOVERNING CONSTRAINT: PRECISION, NOT RECALL
// ============================================================================
//
// §11 names the way this feature dies: "Prose is not a claim language. If 'the
// build is green' cannot be reliably linked to its evidence, T1 degrades to
// noise." A detector that flags ten real problems and forty innocent sentences
// gets switched off in a week, and then it catches nothing at all.
//
// So every rule here is deliberately narrow, and anything it cannot decide
// becomes `unchecked` — which §6 makes a first-class outcome that drags the
// whole receipt down to NOT CHECKED. Under-reporting is recoverable. Crying
// wolf is not.
//
// Concretely, three decisions that each trade recall for precision:
//
//   1. FENCED CODE IS STRIPPED. An agent showing `mcp__github__create_pull_request`
//      in a usage example is not claiming to have called it. Leaving code blocks
//      in was the single largest false-positive source in the first draft.
//   2. A BARE MENTION IS NOT A CLAIM. "You can use `Bash` for that" asserts
//      nothing about this session. Only a mention carrying a first-person
//      completive marker ("I ran", "called", "I used") is scored as a claim of
//      having done it; everything else is `unchecked`.
//   3. AN ACKNOWLEDGED FAILURE IS NOT A FALSE CLAIM. "exit 1, as expected" and
//      "the command failed, so I fell back" both put success-shaped words next
//      to a failed tool. If the span also acknowledges the failure, T1 stands
//      down.
//
// What this catches, stated plainly so it is not oversold: an agent that names
// a tool it never invoked, and an agent that asserts success over a tool call
// that errored or was denied. It does NOT catch a fabricated OUTCOME of a tool
// that genuinely ran and genuinely succeeded — LESSONS A6, the `send_later`
// entry — which is T2 by construction and is reported as unchecked.

import type { ClaimSpan, ParsedTranscript, ToolInvocation } from '../TranscriptParser';
import type { Finding } from './types';

/** Bumped when any rule below changes, so an old finding stays interpretable. */
export const CLAIM_RULES_VERSION = 'trustshell-claims/1.0.0';

/**
 * How much of a claim is copied into a finding.
 *
 * A receipt is meant to be publishable, and `claimSpan` copies the agent's prose
 * out of the session into it. Bounding the excerpt keeps a published receipt
 * from becoming a transcript leak. The full text stays where it always was — in
 * the transcript, addressable by `recordUuid`.
 */
export const EXCERPT_MAX = 160;

const excerpt = (s: string): string => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= EXCERPT_MAX ? flat : `${flat.slice(0, EXCERPT_MAX - 1)}…`;
};

// ---------------------------------------------------------------------------
// Text preparation
// ---------------------------------------------------------------------------

/**
 * Remove fenced code blocks and indented blocks, keeping inline code.
 *
 * Inline backticks are how a tool is NAMED in prose, so they must survive;
 * fenced blocks are how a tool is DEMONSTRATED, and a demonstration is not a
 * claim. Unterminated fences run to the end of the text, which is the
 * conservative reading — better to drop trailing prose than to scan a code
 * sample as an assertion.
 */
export function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' ');
}

/** Rough sentence split. Also breaks on newlines and list bullets. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:])\s+|\n+|(?=^\s*[-*•]\s)/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * First-person completive markers: the difference between naming a tool and
 * claiming to have used it.
 *
 * Present tense is excluded on purpose. "I am running the build" and "I will
 * call X" are not assertions that it happened.
 */
const COMPLETIVE =
  /\b(?:i|we)\s+(?:just\s+|already\s+|then\s+)?(?:ran|called|used|invoked|executed|queried|fetched|installed|checked)\b|^\s*(?:ran|called|used|invoked|executed|queried|fetched)\b/i;

/** Words that concede a failure, which stand T1 down. */
const ACKNOWLEDGES_FAILURE =
  /\b(?:fail(?:ed|s|ure)?|error(?:ed|s)?|denied|blocked|refused|rejected|unavailable|unreachable|timed?\s*out|non-?zero|exit(?:ed)?\s*(?:code\s*)?[1-9]|could\s*not|couldn'?t|did\s*not|didn'?t|no\s+access|403|404|500)\b/i;

/**
 * Assertions of success — MECHANICAL ONLY.
 *
 * `clean`, `green` and `verified` were in the first draft and were removed after
 * measurement: on the one real session available they produced two findings and
 * both were false positives. "VERIFIED" is this codebase's epistemic tag, not a
 * claim about a tool; "green" appeared in "prior-work green" describing a CI job
 * that was nowhere near the linked call. Words that carry a house meaning cannot
 * be scored as assertions about adjacent evidence.
 *
 * What is left is checkable and hard to say by accident: an exit code, a
 * pass/fail count, or an explicit "no X found".
 */
const ASSERTS_SUCCESS =
  /\b(?:exit(?:ed)?\s*(?:code\s*)?0|exit=0|passed|passing|succeeded|success(?:ful|fully)?|no\s+(?:[\w-]+\s+){0,3}(?:found|detected)|0\s+(?:failed|failures|errors))\b/i;
// The hyphen class is load-bearing: the LESSONS case this tier exists to catch
// says "No credential-shaped strings found", and `\w` does not span a hyphen, so
// the first draft missed the one failure it was calibrated against.

// ---------------------------------------------------------------------------
// T0 — a tool named in prose with no matching tool_use anywhere
// ---------------------------------------------------------------------------

/**
 * `mcp__server__tool` is unambiguous — nothing in English looks like it.
 *
 * Bare built-in names are NOT matched: `Read`, `Write`, `Edit`, `Task` and
 * `Bash` are ordinary words, and scanning prose for them would flag half the
 * sentences in any session. They are only matched inside backticks, where the
 * author has marked them as an identifier.
 */
const MCP_TOOL = /\bmcp__[a-z0-9_]+__[a-z0-9_]+\b/gi;
const BACKTICKED = /`([A-Za-z][A-Za-z0-9_]{1,63})`/g;

/** Built-ins, matched only when backticked. */
export const BUILTIN_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'Agent',
  'WebSearch', 'WebFetch', 'NotebookEdit', 'TodoWrite', 'Monitor',
  'ToolSearch', 'Skill', 'Artifact', 'SendUserFile', 'AskUserQuestion',
]);

export interface ToolMention {
  tool: string;
  sentence: string;
  completive: boolean;
}

export function extractToolMentions(text: string): ToolMention[] {
  const out: ToolMention[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences(stripCodeBlocks(text))) {
    const completive = COMPLETIVE.test(sentence);
    const found = new Set<string>();

    for (const m of sentence.matchAll(MCP_TOOL)) found.add(m[0]);
    for (const m of sentence.matchAll(BACKTICKED)) {
      if (BUILTIN_TOOLS.has(m[1])) found.add(m[1]);
    }

    for (const tool of found) {
      // One finding per (tool, completive) pair per span; a tool named six
      // times in one paragraph is one claim, not six.
      const key = `${tool}|${completive}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tool, sentence, completive });
    }
  }
  return out;
}

function toolWasUsed(parsed: ParsedTranscript, tool: string): boolean {
  if (parsed.toolsByName[tool] > 0) return true;
  // MCP tools appear under their bare name with the server in `mcpServer`, or
  // under the full mcp__ id, depending on the client. Accept either, because
  // guessing wrong here invents a contradiction out of a naming convention.
  const tail = tool.startsWith('mcp__') ? tool.split('__').slice(2).join('__') : null;
  if (tail && parsed.toolsByName[tail] > 0) return true;
  if (tail && parsed.tools.some((t) => t.name === tail || t.name === tool)) return true;
  const server = tool.startsWith('mcp__') ? tool.split('__')[1] : null;
  if (server && parsed.tools.some((t) => t.mcpServer === server && (t.name === tail || t.name === tool))) {
    return true;
  }
  return false;
}

export function checkT0(parsed: ParsedTranscript): Finding[] {
  const findings: Finding[] = [];

  for (const span of parsed.claims) {
    for (const mention of extractToolMentions(span.text)) {
      if (toolWasUsed(parsed, mention.tool)) {
        // "I ran X" and X has a tool_use in this session. That specific
        // assertion is decidably supported — this is the one thing either tier
        // can actually confirm, and it is what gives VERIFIED a path at all.
        // A bare mention of a used tool asserts nothing, so it stays silent.
        if (mention.completive) {
          findings.push({
            tier: 'T0',
            claimSpan: excerpt(mention.sentence),
            evidenceRef: span.recordUuid,
            verdict: 'backed',
          });
        }
        continue;
      }

      findings.push({
        tier: 'T0',
        claimSpan: excerpt(mention.sentence),
        evidenceRef: span.recordUuid,
        // A completive marker over a tool with zero invocations is the whole
        // point of T0. Without one it is a mention, and a mention is not a lie
        // — but it is also not something this tier can clear, so it is
        // unchecked rather than silently dropped.
        verdict: mention.completive ? 'contradicted' : 'unchecked',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// T1 — a success claim over evidence that failed
// ---------------------------------------------------------------------------

/**
 * Tools whose results landed between the previous claim span and this one.
 *
 * Proximity linking, as §4.3 specifies. Timestamps are the only ordering that
 * survives the transcript being a forest rather than a log — record order within
 * a branch is not reliable, and `parentUuid` chains do not say which sibling
 * won.
 *
 * A claim with no timestamp cannot be linked at all. That returns null, and the
 * caller reports `unchecked` — not "no evidence of a problem".
 */
export function linkEvidence(
  parsed: ParsedTranscript,
  span: ClaimSpan,
  previousSpan: ClaimSpan | null
): ToolInvocation[] | null {
  if (!span.timestamp) return null;
  const upper = Date.parse(span.timestamp);
  if (Number.isNaN(upper)) return null;

  const lowerRaw = previousSpan?.timestamp ? Date.parse(previousSpan.timestamp) : Number.NEGATIVE_INFINITY;
  const lower = Number.isNaN(lowerRaw) ? Number.NEGATIVE_INFINITY : lowerRaw;

  return parsed.tools.filter((t) => {
    // An orphan has no result, so it has no resultTimestamp; fall back to when
    // it was invoked, or it would never link and a claim about a denied call
    // would go unexamined.
    const stamp = t.resultTimestamp ?? t.timestamp;
    if (!stamp) return false;
    const at = Date.parse(stamp);
    return !Number.isNaN(at) && at > lower && at <= upper;
  });
}

export function checkT1(parsed: ParsedTranscript): Finding[] {
  const findings: Finding[] = [];
  let previous: ClaimSpan | null = null;

  for (const span of parsed.claims) {
    const body = stripCodeBlocks(span.text);

    if (!ASSERTS_SUCCESS.test(body)) {
      previous = span;
      continue;
    }

    const linked = linkEvidence(parsed, span, previous);
    previous = span;

    if (linked === null) {
      findings.push({
        tier: 'T1',
        claimSpan: excerpt(body),
        evidenceRef: span.recordUuid,
        verdict: 'unchecked',
      });
      continue;
    }

    // ONLY the immediately preceding call, not any failure in the window.
    //
    // "any failed tool in the window" was the first draft's rule and it is
    // fundamentally too weak: a span typically follows several calls, and
    // asserting success about one while an unrelated other errored is ordinary,
    // correct reporting. Both false positives on the measured session had this
    // shape. A claim can only contradict the evidence it actually sits on.
    const last = linked.length > 0 ? linked[linked.length - 1] : null;
    const bad = last && (last.outcome === 'error' || last.outcome === 'denied') ? [last] : [];

    if (bad.length === 0) {
      // NOT `backed`. T1 can refute; it cannot confirm.
      //
      // The first draft scored a success claim next to a successful call as
      // backed, and hand-labelling the five it produced on the measured session
      // showed every one was over-claimed: they were long summary messages
      // containing "exit 0" or "passed" somewhere, sitting after an unrelated
      // call that happened to succeed. Proximity to a green tool does not
      // establish that a specific sentence is supported by it.
      //
      // Absence of a contradiction is not evidence of support. Scoring it as
      // support is the two-outcome collapse this whole file exists to avoid —
      // and it would let a receipt reach VERIFIED on adjacency alone.
      findings.push({
        tier: 'T1',
        claimSpan: excerpt(body),
        evidenceRef: span.recordUuid,
        verdict: 'unchecked',
      });
      continue;
    }

    // The span concedes the failure it sits next to. "exit 1, as expected" and
    // "the scan failed so I re-ran it" are honest reporting, not false claims.
    if (ACKNOWLEDGES_FAILURE.test(body)) {
      findings.push({
        tier: 'T1',
        claimSpan: excerpt(body),
        evidenceRef: span.recordUuid,
        verdict: 'unchecked',
      });
      continue;
    }

    findings.push({
      tier: 'T1',
      claimSpan: excerpt(body),
      evidenceRef: `${span.recordUuid ?? '?'} → ${bad.map((t) => `${t.name}:${t.outcome}`).join(', ')}`,
      verdict: 'contradicted',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------

export interface ClaimsResult {
  total: number;
  verified: number;
  unchecked: number;
  failed: number;
  findings: Finding[];
}

/**
 * Run the enabled tiers and tally.
 *
 * `total` counts CLAIM SPANS examined, not findings — one span can produce
 * several findings, and a receipt reporting "47 claims" should mean the agent
 * made 47 assertions, not that 47 rules fired.
 *
 * When no tier is enabled this returns all zeros, and `markerFor` turns that
 * into NOT_CHECKED rather than VERIFIED. See TRUSTSHELL-V1 §12.5.
 */
export function checkClaims(
  parsed: ParsedTranscript,
  tiers: { t0: boolean; t1: boolean }
): ClaimsResult {
  const findings: Finding[] = [];
  if (tiers.t0) findings.push(...checkT0(parsed));
  if (tiers.t1) findings.push(...checkT1(parsed));

  if (!tiers.t0 && !tiers.t1) {
    return { total: 0, verified: 0, unchecked: 0, failed: 0, findings: [] };
  }

  // Every span the tiers did not reach is unchecked, not clean. Without this a
  // session of 200 assertions where two rules fired would report "2 claims",
  // and 198 unexamined statements would vanish from the receipt.
  const examined = new Set(findings.map((f) => f.evidenceRef?.split(' ')[0]).filter(Boolean));
  const unexamined = parsed.claims.filter((c) => c.recordUuid && !examined.has(c.recordUuid)).length;

  return {
    total: parsed.claims.length,
    verified: findings.filter((f) => f.verdict === 'backed').length,
    unchecked: findings.filter((f) => f.verdict === 'unchecked').length + unexamined,
    failed: findings.filter((f) => f.verdict === 'contradicted').length,
    findings,
  };
}
