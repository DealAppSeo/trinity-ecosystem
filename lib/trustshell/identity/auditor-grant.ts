// lib/trustshell/identity/auditor-grant.ts
//
// A delegated ControlProof for the auditor seat that is PROVABLY read-only.
//
// Build order step 6, described in the design doc as "assembly of delegation.ts
// + loop-authorizer.ts; near-zero new code". The assembly is indeed small. The
// thing that is not small, and that the description hides, is the word
// **provably**.
//
// ── WHY "read-only capabilities" IS NOT A CHECKABLE STATEMENT ────────────────
//
// The obvious implementation delegates a capability set that looks read-only —
// `read:*`, `vault:read`, `memory:recall` — and calls it done. That checks
// nothing. A capability string is an opaque name; whether it reaches a write
// depends entirely on the TOOL→CAPABILITY MAP the authorizer is configured
// with, which lives somewhere else and changes independently.
//
// `read:*` authorizes a write the moment somebody maps a write tool to
// `read:reports` — a plausible name for a tool that generates a report and
// saves it. Nothing in the capability algebra objects, because nothing in the
// capability algebra knows what the tools do. The grant still looks read-only
// in every log and every review.
//
// So this file does not assert read-only. It COMPUTES it, against the two maps
// the loop already holds:
//
//   toolCapabilities   which capability each tool requires   (loop-authorizer)
//   toolEffects        what each tool does to the world      (LoopPolicy)
//
// A grant is read-only exactly when no tool with effect `write` or `unknown` is
// reachable from it. That is a search, it returns the offending tools by name,
// and it is the difference between a claim and a proof.
//
// ── `unknown` COUNTS AS A WRITE, HERE TOO ────────────────────────────────────
//
// Same rule as the loop's write budget, for the same reason: `rm -rf` and
// `git status` arrive through the same Bash tool, so a tool nobody classified
// is not a tool that is safe. An auditor that can reach an unclassified tool is
// not a read-only auditor — it is an auditor whose blast radius nobody measured.
//
// The consequence is deliberate and will be felt: a fleet with a half-populated
// `toolEffects` cannot mint an auditor grant at all. That is the correct
// failure. Classifying the tools is the work; skipping it and calling the
// auditor read-only is the bug.
//
// ── WHAT THIS BUYS THAT POLICY DOES NOT ──────────────────────────────────────
//
// The loop already refuses writes when the budget is 0. That is OUR code
// deciding, and a third party has to trust us about it. A delegated ControlProof
// attenuated to a capability set that provably cannot reach a write is checkable
// by anyone holding the chain: the auditor's authority is bounded by
// cryptography rather than by our good behaviour. That is the same distinction
// `checker_must_not_be_doer` gets by comparing DIDs instead of trusting a flag.

import { delegate, type DelegatedControlProof } from './delegation';
import { permits } from './capability';
import type { ControlProof } from './control-proof';
import type { AgentIdentity } from './identity';
import { sameDid, type Did } from './did';

/** Tool name → the capability a call to it requires. Same shape the authorizer uses. */
export type ToolCapabilityMap = Readonly<Record<string, string>>;

/**
 * Tool name → what it does to the world.
 *
 * Restated rather than imported from the harness kernel: this module is part of
 * the identity layer, and the kernel is meant to ship standalone. The three
 * values are deliberately the loop's.
 */
export type ToolEffect = 'write' | 'read' | 'unknown';
export type ToolEffectMap = Readonly<Record<string, ToolEffect>>;

/** A tool a capability set can reach that it should not be able to. */
export interface WriteReach {
  tool: string;
  /** The capability the tool requires. */
  capability: string;
  effect: ToolEffect;
  /** The granted capability that permits it. Names the specific over-grant. */
  grantedBy: string;
}

export interface ReadOnlyAnalysis {
  /** True only when `reaches` is empty AND the effect map covered every tool. */
  readOnly: boolean;
  /** Every write-or-unknown tool this capability set can reach. Empty is the goal. */
  reaches: readonly WriteReach[];
  /**
   * Tools the capability set can reach that the effect map does not classify.
   *
   * Reported separately from `reaches` even though both block a grant, because
   * they call for different fixes: a reach is an over-broad capability, an
   * unclassified tool is missing configuration. Telling an operator to narrow a
   * capability when the real problem is an unlabelled tool sends them to the
   * wrong file.
   */
  unclassified: readonly string[];
  detail: string;
}

/**
 * Which write-or-unknown tools can this capability set reach?
 *
 * The whole point of the module. Pure, synchronous, and it names offenders
 * rather than returning a boolean — "this grant is not read-only" is not
 * actionable, "this grant reaches `deploy.publish` via `ops:*`" is.
 */
export function analyseReadOnly(input: {
  capabilities: readonly string[];
  toolCapabilities: ToolCapabilityMap;
  toolEffects: ToolEffectMap;
}): ReadOnlyAnalysis {
  const { capabilities, toolCapabilities, toolEffects } = input;
  const reaches: WriteReach[] = [];
  const unclassified: string[] = [];

  for (const [tool, required] of Object.entries(toolCapabilities)) {
    // Which granted capability, if any, opens this tool. Found rather than
    // tested, so the finding can name it.
    const grantedBy = capabilities.find((held) => permits(held, required));
    if (grantedBy === undefined) continue; // unreachable: not a concern

    const effect = toolEffects[tool];
    if (effect === undefined) {
      // Reachable and unclassified. NOT treated as read: an unlabelled tool is
      // one nobody measured, and assuming the safe answer about an unmeasured
      // thing is this repo's defining defect.
      unclassified.push(tool);
      continue;
    }
    if (effect === 'read') continue;

    reaches.push({ tool, capability: required, effect, grantedBy });
  }

  const readOnly = reaches.length === 0 && unclassified.length === 0;
  if (readOnly) {
    return {
      readOnly: true,
      reaches: [],
      unclassified: [],
      detail:
        `no tool with effect 'write' or 'unknown' is reachable from these ${capabilities.length} ` +
        'capabilities, across every tool in the map',
    };
  }

  const parts: string[] = [];
  if (reaches.length > 0) {
    parts.push(
      `reaches ${reaches.length} write-or-unknown tool(s): ` +
        reaches.map((r) => `${r.tool} (${r.effect}) via '${r.grantedBy}'`).join(', ')
    );
  }
  if (unclassified.length > 0) {
    parts.push(
      `reaches ${unclassified.length} tool(s) the effect map does not classify: ` +
        `${unclassified.join(', ')}. An unclassified tool counts as a write — classify it ` +
        'rather than assuming it is safe.'
    );
  }
  return { readOnly: false, reaches, unclassified, detail: parts.join('; ') };
}

export class NotReadOnly extends Error {
  constructor(readonly analysis: ReadOnlyAnalysis) {
    super(
      `refusing to mint an auditor grant that is not provably read-only: ${analysis.detail}. ` +
        'A grant described as read-only that can reach a write is worse than no grant, because ' +
        'every later reader will trust the description.'
    );
    this.name = 'NotReadOnly';
  }
}

export interface AuditorGrantInput {
  /** The proof the auditor's authority is attenuated from. */
  parent: ControlProof | DelegatedControlProof;
  /** Who is delegating. `delegate()` requires this to be the parent's subject. */
  delegator: AgentIdentity;
  /** The auditor. MUST differ from the doer — asserted here, not assumed. */
  auditor: AgentIdentity;
  /** The agent whose work is being audited. */
  doerDid: Did;
  /** The capabilities to delegate. Checked, not trusted. */
  capabilities: readonly string[];
  toolCapabilities: ToolCapabilityMap;
  toolEffects: ToolEffectMap;
  /**
   * REQUIRED, matching `delegate()`. No default, because the convenient default
   * is a long one and an auditor grant that outlives the audit is a standing
   * credential nobody remembers issuing.
   */
  ttlSeconds: number;
  now?: Date;
}

export interface AuditorGrant {
  proof: DelegatedControlProof;
  /** The proof that it is read-only, carried alongside so it need not be recomputed. */
  analysis: ReadOnlyAnalysis;
}

/**
 * Mint a delegated ControlProof for the auditor seat, refusing unless it is
 * provably read-only.
 *
 * REFUSES AT MINT TIME rather than reporting at verify time. A grant that
 * exists is a grant that gets passed around, logged, and trusted by its
 * description; the only reliable moment to stop a mislabelled one is before it
 * has bytes.
 */
export async function delegateAuditorGrant(input: AuditorGrantInput): Promise<AuditorGrant> {
  // Constitutional, and checked here as well as in the contract. Two checks of
  // one invariant is the deliberate redundancy pattern from LESSONS A13 — and
  // this is the path where a violation would be least visible, because a
  // delegation chain verifies perfectly whether or not the delegate happens to
  // be the agent under audit.
  if (sameDid(input.auditor.did, input.doerDid)) {
    throw new Error(
      `the auditor and the doer are the same identity (${input.auditor.did}). ` +
        'verification.checker_must_not_be_doer is constitutional; an agent may not hold a ' +
        'grant to audit itself.'
    );
  }

  const analysis = analyseReadOnly({
    capabilities: input.capabilities,
    toolCapabilities: input.toolCapabilities,
    toolEffects: input.toolEffects,
  });
  if (!analysis.readOnly) throw new NotReadOnly(analysis);

  const proof = await delegate({
    parent: input.parent,
    delegator: input.delegator,
    delegate: input.auditor,
    capabilities: [...input.capabilities],
    ttlSeconds: input.ttlSeconds,
    now: input.now,
  });

  return { proof, analysis };
}
