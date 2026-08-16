// scripts/check-repid-marginal.mjs
//
// Sprint D4: "the marginal-value inversion is unresolved. Re-measure under
// 57200/0.5 — the reshaped curve should have reduced it, but that is a
// prediction, not a measurement."
//
// Measured. The prediction HOLDS and the diagnosis does not.
//
//   old 5000/100    +0.01 buys 880 at the bottom,  0 at the top   (unbounded)
//   new 57200/0.5   +0.01 buys 124 at the bottom, 11 at ws=0.99
//
// But 11 is not the curve. Below saturation the curve's own spread is
// 124 -> 83, a factor of 1.49 — a logarithm behaving like a logarithm. The
// collapse to zero comes from the CLAMP: 57200/0.5 evaluates to 10072.42 at
// weightedSum 1, so the calibration overshoots REPID_MAX by 72 points and
// everything above weightedSum ~= 0.9915 scores exactly 10000.
//
// That distinction is the point of this gate. "The curve pays least at the top"
// sends someone to reshape the logarithm, which would move 1.49. Only the
// overshoot moves the zero.
//
// WHAT THIS GATE DOES NOT DECIDE. Whether a 0.85%-wide dead band is acceptable
// is a product call about who it affects — sprint rule 4 says a gate that fails
// the build over a pending operator decision is a gate that gets ignored. So the
// band is MEASURED and reported here, and the build does not go red over it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.repid-marginal-check-'));
let R;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/repid-scoring.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'inherit' }
  );
  R = await import(pathToFileURL(join(outDir, 'trustshell', 'repid-scoring.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  throw e;
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`);
};
const near = (a, b, tol, m) => {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${m}: expected ${b} ±${tol}, got ${a}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(m);
};

const sat = R.saturationPoint();

check('the recalibration DID reduce the inversion — D4 predicted it, this measures it', () => {
  // Under the old 5000/100 constants the top bought literally nothing. The
  // constants are not parameters of the module, so the old figures are quoted
  // from the sprint record rather than recomputed; what is asserted here is the
  // NEW behaviour, which is that the top now buys something.
  const top = R.marginalValueAt(0.99);
  truthy(top > 0, `a near-perfect agent must gain something from real improvement, got ${top}`);
  eq(top, 11, '+0.01 at weightedSum 0.99');
});

check('THE DIAGNOSIS: the curve itself is nearly flat in marginal value', () => {
  // Both sampled BELOW saturation, so this is the logarithm alone with no clamp
  // in it. 1.49 is not an incentive problem worth a sprint.
  const bottom = R.marginalValueAt(0.01);
  const nearTop = R.marginalValueAt(0.98);
  eq(bottom, 124, '+0.01 at the bottom');
  eq(nearTop, 83, '+0.01 at 0.98, still below saturation');
  const ratio = bottom / nearTop;
  near(ratio, 1.494, 0.005, "the CURVE's own marginal spread");
  truthy(ratio < 2, 'a log curve paying 1.49x more at the bottom is a log curve, not a defect');
});

check('THE CAUSE: the calibration overshoots REPID_MAX', () => {
  near(sat.uncappedAtOne, 10072.42, 0.01, 'what 57200/0.5 scores at weightedSum 1');
  eq(R.REPID_MAX, 10000, 'the clamp');
  near(sat.overshoot, 72.42, 0.01, 'points of overshoot — this is what creates the dead band');
  truthy(sat.overshoot > 0, 'if the curve did not overshoot there would be no saturation band');
});

check('MEASURED: the dead band, where improvement buys exactly zero', () => {
  near(sat.atWeightedSum, 0.9915, 0.0005, 'saturation begins');
  near(sat.bandWidth, 0.0085, 0.0005, 'band width in weighted-sum units');
  // Inside it, the derivative is exactly zero — not small, zero.
  eq(R.marginalValueAt(0.995), 0, 'inside the band, +0.01 buys nothing');
  eq(R.marginalValueAt(0.999), 0, 'and still nothing nearer the top');
  eq(R.scoreFromWeightedSum(0.995), R.scoreFromWeightedSum(1), 'the whole band scores identically');
});

check('reachableCeiling is the CLAMP, not the curve', () => {
  // The docstring derives it as "the curve evaluated at 1". That derivation now
  // passes through the clamp, so the returned number is REPID_MAX and the raw
  // curve value is invisible. Pinned so the two cannot silently diverge again.
  eq(R.reachableCeiling(), R.REPID_MAX, 'the ceiling is the clamp');
  truthy(
    sat.uncappedAtOne > R.reachableCeiling(),
    'the curve reaches higher than the ceiling reports — that gap IS the band'
  );
});

check('the inversion is bounded and must not silently worsen', () => {
  // A regression guard rather than a target: if a future recalibration widens
  // the band or steepens the curve, this goes red and somebody decides on
  // purpose instead of discovering it in a payment gate.
  truthy(sat.bandWidth < 0.02, `dead band must stay under 2% of range, got ${sat.bandWidth}`);
  truthy(
    R.marginalValueAt(0.01) / R.marginalValueAt(0.98) < 2,
    'the sub-saturation curve must stay near-linear in marginal value'
  );
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nrepid-marginal: ${passed} passed, ${failures.length} failed\n`);
console.log('  weightedSum   +0.01 buys');
for (const ws of [0.01, 0.5, 0.95, 0.98, 0.985, 0.99, 0.995, 0.999]) {
  const m = R.marginalValueAt(ws);
  console.log(
    `  ${String(ws).padEnd(11)}   ${String('+' + m).padStart(5)}` +
      (m === 0 ? '   <- dead band' : '')
  );
}
console.log(
  `\n  saturation at weightedSum ${sat.atWeightedSum.toFixed(4)}, ` +
    `band ${(sat.bandWidth * 100).toFixed(2)}% of range, overshoot ${sat.overshoot.toFixed(2)} points`
);

if (failures.length > 0) {
  console.log('\nFAILED — the marginal-value shape is not what was measured.\n');
  process.exit(1);
}
console.log(
  '\ncheck:repid-marginal — VERIFIED. The curve is near-linear in marginal value;\n' +
    '  the top-end collapse is the REPID_MAX clamp, not the logarithm.\n' +
    '\n  NOT CHECKED (operator call, deliberately not failing the build):\n' +
    '  whether a 0.85%-wide dead band at the top of the range is acceptable.\n' +
    '  Closing it means lowering the multiplier so the curve lands ON 10000,\n' +
    '  which moves every score and therefore every tier — Sean-gated.\n'
);
