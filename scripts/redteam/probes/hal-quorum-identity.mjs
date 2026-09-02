// QUORUM-001 — a HAL panelist's MODEL IDENTITY must be verifiable, not taken on trust.
//
// THREAT. HAL's fact-check verdict is a Byzantine-fault-tolerant quorum: N models
// vote, and the verdict is trustworthy BECAUSE the voters are independent. That
// independence is only real if each panelist actually IS the model it claims. If
// the model label is self-reported, a relay (or a cost-cutting router) can list
// `gemini+mistral+qwen` while quietly routing every leg to one cheap model — the
// quorum collapses to a single voter wearing five hats, and every downstream
// consumer still reads "5-model consensus". A trust claim with no independence
// behind it: this repo's signature defect, in the one place the whole trust layer
// leans on.
//
// FOLD-IN (docs/AGENTIC-SECURITY-STACK.md, from the AI-Infra-Guard analysis). AIG
// binds a model's identity to an unforgeable attestation — a Claude thinking
// signature is an AEAD-encrypted protobuf a relay cannot forge. The question this
// asks of HAL is exactly AIG's: can a substituted panelist be DETECTED?
//
// WHAT THIS JUDGES (scripts/redteam/evidence/hal-quorum-identity.json):
//
//   HELD        every panelist counted toward a quorum carries a present, VALID
//               model-identity attestation — a relay swap would fail verification.
//   BREACHED    a panelist that IS counted has a missing or invalid attestation —
//               an unverified voter is inflating the quorum, or a forgery was caught.
//   NOT_CHECKED  there is no per-panelist attestation capability at all, so model
//               identity is self-reported and a swap is undetectable. Not a pass
//               (we cannot say the quorum is independent) and not a breach (no
//               forgery observed) — an honest absence, with the recipe to close it.
//
// Verdict-level EAS/zkp attestation (hal_production_events, hal_snapshot_registry)
// does NOT satisfy this: it attests the OUTCOME, not which models produced it.
//
// Read-only: judges recorded schema/aggregate facts. No prompt text, no proof bytes.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'hal-quorum-identity.json';
const MAX_AGE_DAYS = 30; // a schema/attestation capability changes slowly

export default {
  id: 'QUORUM-001',
  title: 'A HAL panelist’s model identity must be verifiable, not self-reported',
  component: 'HAL / cross-LLM fact-check quorum',
  severity: 'High',
  threat:
    'If a panelist’s model label is self-reported, a relay can route several "independent" votes to one model while the record shows a full quorum — an N-model consensus that is really one voter, and every downstream trust decision inherits the lie.',

  async run() {
    const path = join(EVIDENCE_DIR, EVIDENCE_FILE);
    if (!existsSync(path)) return notChecked(`no evidence at ${path}`, howToCollect());

    let ev;
    try {
      ev = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      return notChecked(`${EVIDENCE_FILE} is not valid JSON: ${e.message}`, howToCollect());
    }

    const collectedAt = Date.parse(ev.collectedAt ?? '');
    if (!Number.isFinite(collectedAt)) return notChecked(`${EVIDENCE_FILE} has no parseable collectedAt`, howToCollect());
    const ageDays = (Date.now() - collectedAt) / 86_400_000;
    if (ageDays > MAX_AGE_DAYS) return notChecked(`evidence is ${Math.round(ageDays)}d old (> ${MAX_AGE_DAYS}d)`, howToCollect());

    const rec = ev.observations?.per_panelist_record ?? {};
    const attColumn = rec.per_panelist_attestation_column;

    // No per-panelist attestation capability exists → identity is self-reported → NOT_CHECKED.
    if (!attColumn || /^none$/i.test(String(attColumn))) {
      return notChecked(
        'HAL records per-panelist model identity as a SELF-REPORTED string with no attestation column — a relay ' +
          'substituting one model for another is undetectable. The hash-chained log proves the row was not altered ' +
          'after the fact; the verdict-level EAS/zkp attestation proves the OUTCOME was recorded; neither verifies ' +
          'WHICH models voted. The quorum’s independence is therefore unverified.',
        howToCollect()
      );
    }

    // Attestation capability exists → judge the panelists that are COUNTED toward a quorum.
    const panelists = rec.panelist_attestations ?? [];
    if (panelists.length === 0) {
      return notChecked(
        `${EVIDENCE_FILE} names an attestation column '${attColumn}' but carries no per-panelist attestation samples to judge`,
        howToCollect()
      );
    }

    const counted = panelists.filter((p) => p.counted_in_quorum !== false);
    const bad = counted.filter((p) => p.attestation_present === false || p.attestation_valid === false);
    if (bad.length > 0) {
      return breached(
        `${bad.length} quorum panelist(s) counted without a valid model-identity attestation — the quorum is inflated by unverified voters`,
        bad
          .map((p) => `  BREACH  claimed '${p.claimed_model ?? '?'}' (provider ${p.provider ?? '?'}): attestation ${p.attestation_present === false ? 'MISSING' : 'INVALID'}`)
          .join('\n')
      );
    }

    return held(
      `every counted panelist carries a valid model-identity attestation via '${attColumn}': ${counted.length} verified, a relay substitution would fail verification`,
      `attestation column: ${attColumn}; ${counted.length} panelist(s) checked, 0 unverified.`
    );
  },
};

function howToCollect() {
  return (
    'Close the gap, then this becomes checkable: add a per-panelist model-identity attestation to the HAL quorum — ' +
    'a token the responder cannot forge that binds the model name (e.g. a Claude thinking-signature / AEAD protobuf per ' +
    'AI-Infra-Guard, or a provider-signed model assertion), stored per row in hal_classifications and VERIFIED at ingest. ' +
    'Then collect into ' + `${EVIDENCE_DIR}/${EVIDENCE_FILE}` + ': set per_panelist_record.per_panelist_attestation_column to ' +
    'the new column, and per_panelist_record.panelist_attestations to [{claimed_model, provider, counted_in_quorum, ' +
    'attestation_present, attestation_valid}] for a recent quorum. Until that exists, model identity is self-reported and ' +
    'this stays NOT_CHECKED. Read-only aggregates; store no prompt text or proof bytes.'
  );
}
