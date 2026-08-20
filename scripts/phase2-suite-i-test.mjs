#!/usr/bin/env node
// scripts/phase2-suite-i-test.mjs
//
// Suite I — impact (docs/policy/phase2-e2e-predicates.md, I1-I6) against a
// real engine (lib/trustshell/impact-score.ts).
//
// npm run check:phase2-suite-i

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.phase2-suite-i-check-'));
let Impact;
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [join(process.cwd(), 'lib/trustshell/impact-score.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Impact = await import(pathToFileURL(join(outDir, 'lib/trustshell/impact-score.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile impact-score.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

// ── I1: unproven (iota_proof=0) => I=0 => delta_imp=0, an OVERRIDE ─────────

check('I1: proof=none => I=0', () => {
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'none', type: 'CODE_CONTRIBUTION', delta0: 100 });
  return r.I === 0 ? true : `I=${r.I}, expected 0`;
});

check('I1: proof=none => delta_imp=0 EVEN with a large positive delta0 (the override, not the formula floor)', () => {
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'none', type: 'CODE_CONTRIBUTION', delta0: 100 });
  // Sanity: the general formula's I=0 floor would be round(0.4*100)=40, which
  // would then clamp to +5 -- NOT 0. Confirms this is genuinely the override
  // path, not a coincidence of the clamp.
  return r.deltaImp === 0 && r.unproven === true
    ? true
    : `deltaImp=${r.deltaImp}, unproven=${r.unproven} -- expected the override (0), not the clamped formula floor`;
});

// ── I2: I=1 => delta_imp = round(2*delta0) BEFORE clamp ────────────────────

check('I2: I=1 (S4 * ecosystem clipped, verified proof) => deltaImpRaw = round(2*delta0)', () => {
  // S4=1.00, ecosystem=1.15 (raw product 1.15, clipped to I=1), proof=1.00
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'verified_bounty_or_contracted', type: 'CODE_CONTRIBUTION', delta0: 7 });
  if (r.I !== 1) return `expected I=1, got ${r.I}`;
  const expectedRaw = Math.round(2 * 7);
  return r.deltaImpRaw === expectedRaw ? true : `deltaImpRaw=${r.deltaImpRaw}, expected ${expectedRaw}`;
});

// ── I3: non-bounty types clamp to [-10, +5] ─────────────────────────────────

check('I3: non-AUDIT_CONTRIBUTION type, high delta0 => deltaImp clamps at +5, not higher', () => {
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'verified_bounty_or_contracted', type: 'CODE_CONTRIBUTION', delta0: 1000 });
  return r.deltaImp === 5 && r.clampMax === 5
    ? true
    : `deltaImp=${r.deltaImp}, clampMax=${r.clampMax}, expected 5/5`;
});

check('I3: non-AUDIT_CONTRIBUTION type, very negative delta0 => deltaImp floors at -10, not lower', () => {
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'verified_bounty_or_contracted', type: 'PEACEMAKER', delta0: -1000 });
  return r.deltaImp === -10 ? true : `deltaImp=${r.deltaImp}, expected -10`;
});

check('I3: deltaImp is always within [-10, +5] for every non-bounty type across a sweep', () => {
  const types = ['CODE_CONTRIBUTION', 'WORKFLOW_CONTRIBUTION', 'TOOL_PIONEER', 'AGENT_TEACHING', 'HANDOFF_COSIGN_VERIFIED', 'PEACEMAKER'];
  const severities = ['S0', 'S1', 'S2', 'S3', 'S4'];
  const whos = ['self_only', 'other_agents', 'people_ops', 'ecosystem'];
  const proofs = ['artifact_ref', 'verified_bounty_or_contracted'];
  for (const type of types) {
    for (const severity of severities) {
      for (const who of whos) {
        for (const proof of proofs) {
          for (const delta0 of [-50, -5, 0, 5, 50]) {
            const r = Impact.computeImpact({ severity, who, proof, type, delta0 });
            if (r.deltaImp < -10 || r.deltaImp > 5) {
              return `${type}/${severity}/${who}/${proof}/delta0=${delta0}: deltaImp=${r.deltaImp} out of [-10,5]`;
            }
          }
        }
      }
    }
  }
  return true;
});

// ── I4: AUDIT_CONTRIBUTION and I>=0.85 => clamp max +8, still integer ──────

check('I4: AUDIT_CONTRIBUTION with I>=0.85 widens clampMax to +8', () => {
  // S4=1.00 * people_ops=1.00 * verified=1.00 = I=1.00 >= 0.85
  const r = Impact.computeImpact({ severity: 'S4', who: 'people_ops', proof: 'verified_bounty_or_contracted', type: 'AUDIT_CONTRIBUTION', delta0: 1000 });
  return r.bountyExceptionApplied === true && r.clampMax === 8 && r.deltaImp === 8
    ? true
    : `bountyExceptionApplied=${r.bountyExceptionApplied}, clampMax=${r.clampMax}, deltaImp=${r.deltaImp}`;
});

check('I4: the +8 clamp result is still an integer', () => {
  const r = Impact.computeImpact({ severity: 'S4', who: 'people_ops', proof: 'verified_bounty_or_contracted', type: 'AUDIT_CONTRIBUTION', delta0: 1000 });
  return Number.isInteger(r.deltaImp) ? true : `deltaImp=${r.deltaImp} is not an integer`;
});

check('I4: AUDIT_CONTRIBUTION with I<0.85 does NOT get the +8 exception -- stays at +5', () => {
  // S0=0.15 * self_only=0.40 * artifact_ref=0.70 -- well under 0.85
  const r = Impact.computeImpact({ severity: 'S0', who: 'self_only', proof: 'artifact_ref', type: 'AUDIT_CONTRIBUTION', delta0: 1000 });
  return r.bountyExceptionApplied === false && r.clampMax === 5
    ? true
    : `expected the exception to NOT apply below I=0.85: bountyExceptionApplied=${r.bountyExceptionApplied}, clampMax=${r.clampMax}, I=${r.I}`;
});

// ── I5: I>1 never stored; clip applies ──────────────────────────────────────

check('I5: rawI can exceed 1 (ecosystem multiplier), but the stored I never does', () => {
  // S4=1.00 * ecosystem=1.15 * verified=1.00 = rawI 1.15 > 1
  const r = Impact.computeImpact({ severity: 'S4', who: 'ecosystem', proof: 'verified_bounty_or_contracted', type: 'CODE_CONTRIBUTION', delta0: 5 });
  return r.rawI > 1 && r.I === 1
    ? true
    : `expected rawI>1 and I===1 (clipped), got rawI=${r.rawI}, I=${r.I}`;
});

check('I5: I is never negative or above 1, across the full input sweep', () => {
  const severities = ['S0', 'S1', 'S2', 'S3', 'S4'];
  const whos = ['self_only', 'other_agents', 'people_ops', 'ecosystem'];
  const proofs = ['none', 'artifact_ref', 'verified_bounty_or_contracted'];
  for (const severity of severities) {
    for (const who of whos) {
      for (const proof of proofs) {
        const r = Impact.computeImpact({ severity, who, proof, type: 'CODE_CONTRIBUTION', delta0: 10 });
        if (r.I < 0 || r.I > 1) return `${severity}/${who}/${proof}: I=${r.I} out of [0,1]`;
      }
    }
  }
  return true;
});

// ── I6: impact never moves axis S; it moves axis E ──────────────────────────

check('I6: every result reports landsOnAxis="E", never "S"', () => {
  const r = Impact.computeImpact({ severity: 'S2', who: 'other_agents', proof: 'artifact_ref', type: 'CODE_CONTRIBUTION', delta0: 5 });
  return r.landsOnAxis === Impact.IMPACT_LANDS_ON_AXIS && r.landsOnAxis === 'E'
    ? true
    : `landsOnAxis=${r.landsOnAxis}, expected the constant "E"`;
});

check('I6: IMPACT_LANDS_ON_AXIS is the fixed exported constant "E" (not derivable as "S" by any input)', () => {
  return Impact.IMPACT_LANDS_ON_AXIS === 'E' ? true : `IMPACT_LANDS_ON_AXIS=${Impact.IMPACT_LANDS_ON_AXIS}`;
});

// ── Report ───────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`phase2-suite-i: ${pass} passed, 0 failed`);
console.log('VERIFIED: Suite I (I1-I6) against a real impact-score engine, full locked parameter table.');
console.log('NOT_CHECKED, by design: delta0\'s numeric source (base_value alone? times severity_multiplier?');
console.log('  a fixed per-type constant?) is not stated anywhere in the locked policy docs this session found --');
console.log('  see lib/trustshell/impact-score.ts\'s header. This suite exercises the curve for ANY delta0;');
console.log('  it does not claim to know which real value a live caller should pass.');
