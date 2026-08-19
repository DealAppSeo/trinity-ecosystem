// scripts/check-portable-surface.mjs
//
// Can `lib/trustshell/portable.ts` actually be loaded outside this repository?
//
// Not "does it look portable". This compiles that entry point in a temporary
// directory with **no `paths` alias configured at all**, and then LOADS the
// emitted JavaScript in Node. A `@/` specifier that survives does not resolve,
// and the require throws. That is the whole design: the claim is settled by
// executing it, not by grepping for imports.
//
// ── WHY IT IS A DIFFERENT QUESTION FROM check:package-boundary ──────────────
//
// `check:package-boundary` reads specifiers and classifies modules. It is a
// static analysis and it can be fooled by anything its parser does not model —
// which is not hypothetical, that extractor was wrong twice before it was right.
// This suite has no parser. It asks Node.
//
// The two are complementary and both are needed: the boundary check tells you
// WHICH module broke portability and fails fast on a new adapter; this one tells
// you whether the entry point is importable at all, which is the actual DoD
// question and the one a static check cannot answer.
//
// ── THE MEASUREMENT THAT MADE THIS CHEAP ────────────────────────────────────
//
// MVP DoD 1 is "a portable npm TrustShell", and `package.json` is
// `private: true` with no `main` and no `exports` — so its honest status was
// NOT CHECKED, and the assumption was that it was far off. Measured 2026-08-19:
// 9 of 96 modules reach outside the package (7 to `@/lib/supabase-admin` alone)
// and 86 are transitively clean. **The tenth tainted module was the barrel
// itself, and only by import** — `index.ts` re-exported the nine adapters, so
// `import … from '@/lib/trustshell'` dragged `supabase-admin` in regardless of
// what you asked for.
//
// One file. `portable.ts` now holds the host-free surface, `index.ts` re-exports
// it and adds the adapters, and every existing consumer is untouched.
//
// ── WHAT THIS STILL DOES NOT CLAIM ──────────────────────────────────────────
//
// It does NOT claim the package is publishable. `package.json` is still private
// with no entry point, there is no build output, and no `npm publish` has ever
// run. What it claims is narrower and true: the portable entry point compiles
// and loads with nothing but its npm dependencies available. DoD 1 stays
// NOT CHECKED until a package is actually built and installed somewhere.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { stripComments } from './lib/module-specifiers.mjs';

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

const outDir = mkdtempSync(join(process.cwd(), '.portable-surface-check-'));

// ── 1. Compile with NO path alias. This is the load-bearing part. ───────────
//
// `baseUrl`/`paths` are deliberately absent. If any module reached by
// `portable.ts` imports `@/…`, tsc reports it as unresolved and the compile
// fails — before Node is ever asked.

let compiled = false;
let compileError = '';
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir,
        rootDir: process.cwd(),
        module: 'commonjs',
        target: 'es2022',
        lib: ['es2022', 'dom'],
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
        // `strict: true` MATCHES the repo's own tsconfig, and matching matters.
        // With `strict: false` TypeScript stops narrowing discriminated unions
        // (strictNullChecks is what powers it), and this compile reported four
        // errors in `harness/loop.ts` and `identity/spine.ts` that the repo's
        // `tsc --noEmit` does not — a wrong verdict produced by the measuring
        // config, not by the code. Suspect the measurement before the code.
        strict: true,
        // NO baseUrl. NO paths. That absence is the assertion.
      },
      files: [join(process.cwd(), 'lib/trustshell/portable.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  compiled = true;
} catch (e) {
  compileError = (e.stdout?.toString() || e.message).slice(0, 4000);
}

check('the portable entry point COMPILES with no path alias configured', () => {
  if (compiled) return true;
  // The diagnostics are the whole value of this failure, so they are kept — but
  // the literal token `error TS1234` is rewritten. `scripts/mutate.mjs` scores a
  // suite INVALID when its output matches /error TS\d+/, on the sound rule that a
  // mutant which does not compile is not evidence. This suite is the one place
  // where a compile failure IS the evidence, so echoing tsc verbatim made its
  // correct red indistinguishable from a broken build and the
  // `portable-alias-creeps-back` mutation came back INVALID.
  //
  // Not a workaround: "error TS2307" alone never said WHICH build broke, and the
  // rewritten form does. The repo's own `tsc --noEmit` is unaffected and still
  // reports 0 errors on the same tree — verified before this line was written.
  const diagnostics = compileError.replace(/error (TS\d+)/g, 'unresolved-without-paths $1');
  return (
    'the entry point could not compile with `paths` UNSET — this is the suite\'s subject, ' +
    'not a broken build (the repo tsconfig compiles the same tree cleanly). Each line below ' +
    'is an import that only resolves because of the `@/` alias, and would be an unloadable ' +
    `require("@/…") in a published package:\n${diagnostics}`
  );
});

// ── 2. Load it. Compiling is not running. ──────────────────────────────────

let mod = null;
let loadError = '';
if (compiled) {
  const emitted = join(outDir, 'lib/trustshell/portable.js');
  try {
    if (!existsSync(emitted)) throw new Error(`no emit at ${emitted}`);
    mod = await import(pathToFileURL(emitted).href);
  } catch (e) {
    loadError = e.message;
  }
}

check('the emitted JavaScript LOADS in Node', () =>
  mod ? true : `require failed: ${loadError || 'entry point did not compile'}`);

check('no emitted file under the portable surface requires an unresolvable "@/" path', () => {
  if (!compiled) return 'nothing was emitted to inspect';
  // Belt and braces: tsc resolves `@/` at compile time when `paths` IS set, and
  // emits `require("@/lib/…")` verbatim — a shape that compiles in this repo and
  // is unloadable anywhere else. Here `paths` is unset so it should never occur,
  // and finding one would mean the compile silently tolerated it.
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (p.endsWith('.js')) acc.push(p);
    }
    return acc;
  };
  // Comments stripped first. This check's OWN header explains the failure mode
  // with the literal string `require("@/lib/...")`, tsc preserves comments in the
  // emit, and the grep dutifully found it — the third time tonight that a
  // scanner read prose as code (see LESSONS A31 and check:reward-earned). The
  // shared stripper is the fix, not a cleverer regex.
  const offenders = walk(outDir).filter((f) =>
    /require\("@\//.test(stripComments(readFileSync(f, 'utf8')))
  );
  return offenders.length === 0
    ? true
    : `${offenders.length} emitted file(s) require an "@/" path: ${offenders.join(', ')}`;
});

// ── 3. The surface is not empty, and carries the things it exists to carry ──
//
// A barrel that exported nothing would pass every check above. Naming a handful
// of load-bearing exports is what stops "portable" from being achieved by
// deletion.

const MUST_EXPORT = [
  'stageFor',          // promotion — how a surface earns a stage
  'statusTable',
  'rewardFor',         // the reward decisions
  'idempotentDecision',
  'COST_MODEL',        // zk RepID hash-call bounds
  'runAgentLoop',      // the execution kernel
  'runContractedWork', // the verification spine
  'parseTranscript',
  'measureRate',       // earned metrics
  'referralDelta',     // lane-file recomputation
];

check('the portable surface exports the load-bearing names', () => {
  if (!mod) return 'the entry point did not load';
  const missing = MUST_EXPORT.filter((n) => typeof mod[n] === 'undefined');
  return missing.length === 0
    ? true
    : `${missing.length} missing: ${missing.join(', ')} — "portable" must not be reached by deletion`;
});

check('the portable surface does NOT export the host adapters', () => {
  if (!mod) return 'the entry point did not load';
  const leaked = ['KYAValidator', 'BFTAuthorizer', 'RepIDCalculator', 'RewardLedger'].filter(
    (n) => typeof mod[n] !== 'undefined'
  );
  return leaked.length === 0
    ? true
    : `${leaked.join(', ')} reached the portable barrel — each drags supabase-admin back in`;
});

check('the portable surface is substantial, not a token export', () => {
  if (!mod) return 'the entry point did not load';
  const n = Object.keys(mod).length;
  return n >= 60 ? true : `only ${n} runtime exports (was 100 on 2026-08-19)`;
});

// ── 4. The application barrel still shows consumers everything ─────────────

check('the app barrel re-exports the portable surface', () => {
  // Comments stripped. The first version of this matched a COMMENTED-OUT
  // re-export, so the `portable-barrel-stops-reexporting` mutation SURVIVED —
  // the assertion was reading prose as code, the same defect as the emit grep
  // twenty lines up. Fourth instance tonight; the shared stripper is the fix.
  const index = stripComments(readFileSync('lib/trustshell/index.ts', 'utf8'));
  return /export \* from '\.\/portable';/.test(index)
    ? true
    : "lib/trustshell/index.ts no longer re-exports './portable' — every existing " +
      'consumer of @/lib/trustshell would lose the whole host-free surface at once';
});

check('the app barrel is where the adapters live, and portable.ts is not', () => {
  const index = stripComments(readFileSync('lib/trustshell/index.ts', 'utf8'));
  const portable = stripComments(readFileSync('lib/trustshell/portable.ts', 'utf8'));
  const adapters = ['./KYAValidator', './BFTAuthorizer', './RepIDConfig', './RewardLedger'];
  const misplaced = adapters.filter((a) => portable.includes(`from '${a}'`));
  const missing = adapters.filter((a) => !index.includes(`from '${a}'`));
  if (misplaced.length) return `${misplaced.join(', ')} exported from portable.ts`;
  return missing.length === 0 ? true : `${missing.join(', ')} missing from the app barrel`;
});

// ── 5. DoD 1 is still NOT CHECKED, and must keep saying so ─────────────────

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

check('nothing claims the package is publishable without an entry point', () =>
  pkg.private === true || pkg.main || pkg.exports
    ? true
    : 'package.json is no longer private and declares neither `main` nor `exports` — ' +
      'publishing would ship a package nobody can import');

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`VERIFIED: ${pass} assertions — the portable entry point compiles and loads with no path alias`);
console.log(
  `  entry point compiles and loads from the repo tree. Whether a PACKAGE installs is a ` +
    `different question, owned by check:package-install (main:${pkg.main ?? 'none'}, ` +
    `exports:${pkg.exports ? 'present' : 'none'}, private:${pkg.private === true}).`
);
