#!/usr/bin/env node
// scripts/check-proof-provider-contract.mjs — the contract a prover must satisfy.
//
// P2 of docs/SPRINT-DECISIONS-2026-08-17.md: "make witnessHidden /
// provenWithoutSecret real". This suite does not make them real — a circuit does
// that. It makes the target EXECUTABLE, so the Plonky3 provider is testable the
// hour it exists rather than argued about.
//
// WHY A CONFORMANCE SUITE AND NOT A TEST OF THE ONE IMPLEMENTATION
//
// `IProofProvider` has two intended implementations and only one today. The
// interesting properties are the ones that DISTINGUISH them, and a suite written
// against `WebCryptoProofProvider` alone cannot express those — it would pin the
// behaviour of the provider that cannot hide, and pass forever without noticing
// that the one that can never arrived.
//
// So every check below is written against the INTERFACE and run over a registry
// of providers, each declaring what it claims to be. Adding Plonky3 to that
// registry is the whole integration step.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────────
//
// C1  A result may not claim more privacy than its provider has.
//     `witnessHidden` must equal `isZeroKnowledge`, on every result. This is the
//     defect the seam was built after: a SHA-256 of a timestamp was labelled
//     `groth16` and published on-chain.
//
// C2  A provider with no prover may not report `proven`.
//     `system: 'none'` implies `proven === false`, always.
//
// C3  **THE HIDING TEST, and the one that matters.** A zero-knowledge provider
//     must verify from PUBLIC INPUTS ALONE. Strip `privateWitness` and call
//     `verify()`: a ZK provider still returns true, a commitment provider cannot.
//     That is mechanically decidable, it is the exact property "witnessHidden"
//     names, and it is what the Plonky3 range-check over (value, bound) has to
//     deliver. Today it is expected to FAIL for WebCrypto — and the suite asserts
//     that it fails, because a commitment provider that passed would mean the
//     commitment does not bind the witness at all.
//
// C4  A provider that cannot prove must say what would fix it.
//     `proven === false` requires a non-empty `notProven`. An unexplained
//     absence is how "no prover ran" becomes "the proof is fine".
//
// C5  The predicate is recomputed, not trusted. A result whose `predicateHolds`
//     was flipped in transit must not verify.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED.

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const results = [];
let ZK_GAP = null;
const record = (state, control, detail) => results.push({ state, control, detail });

let P = null;
const outDir = mkdtempSync(join(process.cwd(), '.proof-contract-check-'));
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/identity/proof-provider.ts', '--outDir', outDir, '--rootDir', 'lib',
      '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
      '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  P = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'proof-provider.js')).href);
} catch (e) {
  record('NOT CHECKED', 'proof-provider.ts compiles', (e.stdout?.toString() || e.message).slice(0, 300));
}

// The registry. Adding the Plonky3 provider here is the integration step, and
// every check below then applies to it unchanged.
const PROVIDERS = P ? [{ label: 'WebCryptoProofProvider', make: () => new P.WebCryptoProofProvider() }] : [];

const statement = () => ({
  predicate: 'gte',
  publicInputs: { bound: 3000, agent: 'trinity-veritas', evidence: 'measured' },
  privateWitness: { value: 3723 },
});

if (P) {
  for (const { label, make } of PROVIDERS) {
    const provider = make();
    const st = statement();
    const proof = await provider.prove(st);

    // C1 ─ a result may not claim more privacy than its provider
    if (proof.witnessHidden === provider.isZeroKnowledge) {
      record('VERIFIED', `${label} · C1 privacy claim matches the provider`,
        `witnessHidden ${proof.witnessHidden} === isZeroKnowledge ${provider.isZeroKnowledge}`);
    } else {
      record('FAILED', `${label} · C1 privacy claim matches the provider`,
        `result says witnessHidden=${proof.witnessHidden}, provider says isZeroKnowledge=${provider.isZeroKnowledge} — ` +
        `this is the "SHA-256 labelled groth16" defect returning`);
    }

    // C2 ─ no prover means not proven
    if (provider.system !== 'none' || proof.proven === false) {
      record('VERIFIED', `${label} · C2 no prover means not proven`,
        `system='${provider.system}' proven=${proof.proven}`);
    } else {
      record('FAILED', `${label} · C2 no prover means not proven`,
        `system='none' but proven=true`);
    }

    // C3 ─ THE HIDING TEST
    const publicOnly = { predicate: st.predicate, publicInputs: st.publicInputs, privateWitness: {} };
    let verifiedWithoutWitness = false;
    try {
      verifiedWithoutWitness = await provider.verify(proof, publicOnly);
    } catch {
      verifiedWithoutWitness = false;
    }
    if (provider.isZeroKnowledge) {
      if (verifiedWithoutWitness) {
        record('VERIFIED', `${label} · C3 verifies from public inputs alone`,
          'a zero-knowledge provider proved the predicate without the witness — witnessHidden is REAL');
      } else {
        record('FAILED', `${label} · C3 verifies from public inputs alone`,
          'provider claims zero-knowledge but verification needed the private witness. ' +
          'isZeroKnowledge is a claim this provider does not meet');
      }
    } else if (verifiedWithoutWitness) {
      record('FAILED', `${label} · C3 commitment binds the witness`,
        'a commitment-only provider verified WITHOUT the witness, which means the commitment ' +
        'does not bind it — the witness could be swapped and the proof would still check');
    } else {
      record('VERIFIED', `${label} · C3 commitment binds the witness`,
        'verification required the witness, as a commitment provider must. This is the check ' +
        'a Plonky3 provider has to INVERT — same assertion, opposite expected branch');
    }

    // C4 ─ an unprovable provider says what would fix it
    if (proof.proven || (typeof proof.notProven === 'string' && proof.notProven.length > 0)) {
      record('VERIFIED', `${label} · C4 an absent proof explains itself`,
        proof.proven ? 'proven, so no explanation owed'
          : `notProven names the fix (${proof.notProven.length} chars)`);
    } else {
      record('FAILED', `${label} · C4 an absent proof explains itself`,
        'proven=false with no notProven — an unexplained absence reads as a success downstream');
    }

    // C5 ─ the predicate is recomputed, not trusted
    const tampered = { ...proof, predicateHolds: !proof.predicateHolds };
    let acceptedTampered = true;
    try {
      acceptedTampered = await provider.verify(tampered, st);
    } catch {
      acceptedTampered = false;
    }
    if (!acceptedTampered) {
      record('VERIFIED', `${label} · C5 a flipped predicate does not verify`,
        'the verifier recomputes rather than trusting the transmitted flag');
    } else {
      record('FAILED', `${label} · C5 a flipped predicate does not verify`,
        'a result whose predicateHolds was flipped in transit still verified');
    }
  }

  // The gap itself. Reported every run, but NOT as NOT_CHECKED: that verdict is
  // reserved for "could not look", and this suite looked. No ZK provider being
  // registered is a measured state of the world, and mis-labelling it would also
  // block `npm run mutate`, whose baseline requires green.
  const anyZk = PROVIDERS.some(({ make }) => make().isZeroKnowledge);
  if (anyZk) {
    record('VERIFIED', 'a zero-knowledge provider is registered', 'P2 target met');
  } else {
    ZK_GAP =
      'no registered provider claims zero-knowledge, so C3\'s ZK branch has never executed. ' +
      'witnessHidden is false everywhere by construction, not by accident. ' +
      'Blocked on the Plonky3 range-check circuit over (value, bound); the build blocker is ' +
      'that `static.crates.io` is absent from the sandbox proxy allowlist while `index.crates.io` ' +
      'is present, so cargo resolves the index and 403s on every tarball.';
  }
}

rmSync(outDir, { recursive: true, force: true });

const width = Math.max(...results.map((r) => r.control.length));
console.log('\nProof provider contract — what a prover must satisfy, written against the interface\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
if (ZK_GAP) console.log(`\n  ⚠ P2 GAP — ${ZK_GAP}`);
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(`\ncheck:proof-provider-contract — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
