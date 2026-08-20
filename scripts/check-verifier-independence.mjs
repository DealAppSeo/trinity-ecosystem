// scripts/check-verifier-independence.mjs
//
// The grader must not be the author.
//
// ── THE INCIDENT THIS CLOSES ────────────────────────────────────────────────
//
// On 2026-08-19 the implementation lane authored GA's two contract files and
// then ran the harness that graded them. Both rows went SOFT-LIVE.
//
// Half of that was caught and fixed the same hour: `check:lane-files` had NO
// content assertions for either GA path, so `{}` would have produced the same
// two rows. Content gates were added and graded against XC's policy file, which
// makes a transcription error fail the build.
//
// **The other half survived the fix.** After the content gates existed, the
// author of the artifacts was still the author of the gates. Grading one
// artifact against another inside a single process catches drift; it cannot
// catch an assumption both artifacts share, and it cannot ask whether the
// contract is the right contract. One process, one model, one set of blind spots.
//
// ── FAMILY, NOT VENDOR ──────────────────────────────────────────────────────
//
// The unit of independence is the TRAINING LINEAGE. `lib/trust/cross-llm-verifier.ts`
// already reasons this way and its comment is the precedent: it pairs a Llama
// model with a GPT model *specifically* for training-data diversity, and records
// that both run behind one provider — "provider redundancy is reduced;
// training-data diversity is preserved".
//
// A shared vendor is a correlated AVAILABILITY risk, not a correlated JUDGEMENT
// risk. It is reported and does not disqualify. Two models from one lineage
// agreeing is one opinion stated twice, and that does disqualify.
//
// ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────────────
//
// **No second family runs today.** No gate in this repo records attribution, so
// every real claim resolves to NOT_CHECKED and `canPromoteToLive` refuses on
// exactly that ground. That is the seam working, not the seam being satisfied.
// Obtaining a genuine disjoint verdict needs credentials and network; where
// those are absent the answer is NOT_CHECKED, never a pass.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { stripComments } from './lib/module-specifiers.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.verifier-independence-check-'));
let V;
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
      files: [join(process.cwd(), 'lib/trustshell/verifier-independence.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  V = await import(pathToFileURL(join(outDir, 'lib/trustshell/verifier-independence.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lib/trustshell/verifier-independence.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

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

const CLAUDE = { family: 'claude', model: 'opus', provider: 'anthropic' };
const LLAMA = { family: 'llama', model: 'llama-3.1-8b-instant', provider: 'groq' };
const GPT_ON_GROQ = { family: 'gpt', model: 'gpt-oss-20b', provider: 'groq' };

// ── 1. The default state of this repo: NOT CHECKED ─────────────────────────

check('missing attribution is NOT_CHECKED and does not count', () => {
  for (const [a, v] of [[null, LLAMA], [CLAUDE, null], [null, null], [undefined, undefined]]) {
    const r = V.assessIndependence(a, v);
    if (r.independence !== 'NOT_CHECKED' || r.counts) return `(${a?.family}/${v?.family}) -> ${r.independence}`;
  }
  return true;
});

check('an UNKNOWN family is never disjoint from anything', () => {
  const r = V.assessIndependence({ family: 'unknown' }, LLAMA);
  const r2 = V.assessIndependence(CLAUDE, { family: 'unknown' });
  return r.independence === 'NOT_CHECKED' && r2.independence === 'NOT_CHECKED'
    ? true
    : `${r.independence} / ${r2.independence} — "unknown" must not launder into independence`;
});

check('NOT_CHECKED explains itself in terms a reader can act on', () => {
  const r = V.assessIndependence(null, null);
  return /not an independent one/.test(r.detail) && /must not read as/.test(r.detail)
    ? true
    : `detail was: ${r.detail}`;
});

// ── 2. Same lineage is one opinion, not two ────────────────────────────────

check('same family does NOT count, whatever the model', () => {
  const r = V.assessIndependence({ family: 'claude', model: 'opus' }, { family: 'claude', model: 'haiku' });
  return r.independence === 'SHARED_FAMILY' && !r.counts
    ? true
    : `${r.independence}, counts=${r.counts} — two models of one lineage are one opinion twice`;
});

check('the shared-family message says WHY, not just that', () => {
  const r = V.assessIndependence(CLAUDE, { family: 'claude' });
  return /one opinion stated twice/.test(r.detail) ? true : `detail was: ${r.detail}`;
});

// ── 3. Lineage decides; vendor is reported ─────────────────────────────────

check('different families COUNT', () => {
  const r = V.assessIndependence(CLAUDE, LLAMA);
  return r.independence === 'DISJOINT' && r.counts ? true : `${r.independence}, counts=${r.counts}`;
});

check('a SHARED VENDOR does not disqualify disjoint lineages', () => {
  // Exactly the pair cross-llm-verifier.ts ships: llama + gpt, both behind groq.
  const r = V.assessIndependence(LLAMA, GPT_ON_GROQ);
  return r.independence === 'DISJOINT' && r.counts
    ? true
    : `${r.independence} — provider redundancy is a separate, weaker concern than lineage`;
});

check('but a shared vendor IS reported, and named in the detail', () => {
  const r = V.assessIndependence(LLAMA, GPT_ON_GROQ);
  return r.sharedProvider === true && /availability is not/.test(r.detail)
    ? true
    : `sharedProvider=${r.sharedProvider}, detail: ${r.detail}`;
});

check('different vendors report sharedProvider false', () => {
  const r = V.assessIndependence(CLAUDE, LLAMA);
  return r.sharedProvider === false ? true : 'anthropic and groq were reported as one provider';
});

// ── 4. Exactly one value counts ────────────────────────────────────────────

check('only DISJOINT sets counts=true', () => {
  const cases = [
    V.assessIndependence(CLAUDE, LLAMA),
    V.assessIndependence(CLAUDE, { family: 'claude' }),
    V.assessIndependence(null, LLAMA),
    V.assessIndependence({ family: 'unknown' }, { family: 'unknown' }),
  ];
  const counting = cases.filter((c) => c.counts);
  return counting.length === 1 && counting[0].independence === 'DISJOINT'
    ? true
    : `${counting.length} verdicts counted: ${counting.map((c) => c.independence).join(', ')}`;
});

// ── 5. bestIndependence takes the best, not a vote ─────────────────────────

check('one disjoint verifier among same-family ones still counts', () => {
  // "Did anyone independent look" is a different question from "did they agree".
  // A majority rule would let a same-family panel outvote the lone dissenter.
  const r = V.bestIndependence(CLAUDE, [{ family: 'claude' }, { family: 'claude' }, LLAMA]);
  return r.independence === 'DISJOINT' && r.counts
    ? true
    : `${r.independence} — a same-family majority must not suppress the one disjoint check`;
});

check('no disjoint verifier means the answer is not DISJOINT', () => {
  const r = V.bestIndependence(CLAUDE, [{ family: 'claude' }, { family: 'claude' }]);
  return r.independence === 'SHARED_FAMILY' && !r.counts ? true : `${r.independence}`;
});

check('an empty verifier list is NOT_CHECKED, not a pass', () => {
  const r = V.bestIndependence(CLAUDE, []);
  return r.independence === 'NOT_CHECKED' && !r.counts ? true : `${r.independence}`;
});

check('familiesInvolved reports every lineage that spoke', () => {
  const f = V.familiesInvolved(CLAUDE, [LLAMA, { family: 'claude' }, null]);
  return f.length === 2 && f.includes('claude') && f.includes('llama')
    ? true
    : `got [${f.join(', ')}]`;
});

// ── 6. The seam is honest about not being satisfied ────────────────────────

check('the module states plainly that no second family runs today', () => {
  const src = readFileSync('lib/trustshell/verifier-independence.ts', 'utf8');
  return /No second family runs today/i.test(src)
    ? true
    : 'the module no longer says it is unsatisfied — a seam that reads as satisfied is worse ' +
      'than the problem it was built for';
});

check('promotion refuses on independence, and names the module', () => {
  const src = stripComments(readFileSync('lib/trustshell/promotion.ts', 'utf8'));
  return /independentEvidenceFor/.test(src) && /selfVerifiedEvidence/.test(src)
    ? true
    : 'promotion.ts does not consult independence — the seam would be a module nobody calls, ' +
      'which is the auditor-grant shape';
});

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — the grader must be disjoint from the author`);
console.log(
  '  NOT CHECKED: no gate in this repo records attribution yet, so every real claim resolves to ' +
    'NOT_CHECKED and canPromoteToLive refuses on that ground. The seam works; it is not satisfied.'
);
