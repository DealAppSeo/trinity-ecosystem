// scripts/generate-policy-json.mjs
//
// Emit `docs/policy/authority-policy.v0.5.yaml` as JSON the Next runtime can
// import.
//
// ── WHY A GENERATED COPY, WHEN TWO COPIES IS THE DEFECT ─────────────────────
//
// Because the alternative is worse, and the copy is gated.
//
// The runtime needs the policy's constants. It cannot read the YAML at request
// time: `docs/` is not traced into a Next build, no module in this repo does a
// runtime `readFileSync`, and making a live payment route the first to try it is
// not a risk worth taking for a config read. Adding a webpack YAML loader would
// make the app build depend on a transform nothing else uses.
//
// So the YAML is the source and this is a build artifact of it. That IS a second
// copy — the thing this repo has logged as a defect four times. What makes it
// safe is that it cannot silently diverge: `check:authority-runtime` regenerates
// from the YAML in memory and fails if the committed JSON differs by one byte.
// Drift is a red build, not a wrong number in production.
//
// Same shape as `referralDelta` recomputing the curve instead of reading the
// published table: a derived value is fine when the derivation is checked.
//
// Run: node scripts/generate-policy-json.mjs [--check]
//   --check  exit 2 if the committed file is stale, and print the diff summary.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

export const YAML_PATH = 'docs/policy/authority-policy.v0.5.yaml';
export const JSON_PATH = 'lib/trustshell/authority-policy.generated.json';

/**
 * The JSON the runtime imports.
 *
 * Only the fields `loadAuthorityPolicy` actually reads are emitted. Shipping the
 * whole document would put every unrelated policy edit into the app bundle and
 * make the drift check fire on changes the runtime does not care about — noise
 * that trains people to regenerate without looking.
 */
export function projectPolicy(doc) {
  return {
    // A header, so nobody edits the artifact by hand.
    _generated: {
      from: YAML_PATH,
      by: 'scripts/generate-policy-json.mjs',
      warning: 'DO NOT EDIT. Regenerate from the YAML; check:authority-runtime fails on drift.',
    },
    meta: { version: doc?.meta?.version },
    authority: {
      A: doc?.authority?.A,
      builder_floor: doc?.authority?.builder_floor,
    },
    decay: { lambda_sigma: doc?.decay?.lambda_sigma },
    composite: { weights: doc?.composite?.weights },
  };
}

export function renderPolicyJson() {
  const doc = yaml.load(readFileSync(YAML_PATH, 'utf8'));
  return JSON.stringify(projectPolicy(doc), null, 2) + '\n';
}

// Only act when run directly, so the suite can import the functions.
if (process.argv[1] && process.argv[1].endsWith('generate-policy-json.mjs')) {
  const wanted = renderPolicyJson();
  if (process.argv.includes('--check')) {
    let actual = '';
    try {
      actual = readFileSync(JSON_PATH, 'utf8');
    } catch {
      console.error(`STALE: ${JSON_PATH} does not exist. Run: node scripts/generate-policy-json.mjs`);
      process.exit(2);
    }
    if (actual !== wanted) {
      console.error(
        `STALE: ${JSON_PATH} does not match ${YAML_PATH}.\n` +
          'The runtime would use a constant the policy no longer states.\n' +
          'Run: node scripts/generate-policy-json.mjs'
      );
      process.exit(2);
    }
    console.log(`${JSON_PATH} is current with ${YAML_PATH}`);
  } else {
    writeFileSync(JSON_PATH, wanted);
    console.log(`wrote ${JSON_PATH} from ${YAML_PATH}`);
  }
}
