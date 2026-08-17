#!/usr/bin/env node
// scripts/durable-ledger-test.mjs
//
// The property under test is an ORDERING one: a ledger that did not load must
// never be saved. Everything else here is scaffolding for that.
//
// Compiles the TypeScript into a temp dir and imports the real module, the way
// the other identity suites do — a test that reimplements the logic proves the
// reimplementation.

import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { compileHarness } from './lib/harness-compile.mjs';

let passed = 0;
const failures = [];
const ok = (cond, what) => (cond ? (passed += 1) : failures.push(what));

// COMPILED IN TWO PIECES, ON PURPOSE.
//
// `ReputationLedger` comes from the shared `compileHarness()` helper, which
// already solves the one hard part: tsc emits the `@/` alias VERBATIM into its
// output, so a module importing through it compiles cleanly and then fails at
// require time. The helper rewrites those specifiers. Reimplementing that here
// would be a second copy of a solved problem.
//
// `durable-ledger.ts` is compiled on its own because it needs none of that: its
// only import is `import type`, which tsc erases completely, so the emitted
// file has no runtime imports at all. That is a property worth asserting rather
// than assuming — a value import would silently reintroduce the alias problem.
const { load } = compileHarness();
const { ReputationLedger } = await load('reputation');

const out = mkdtempSync(join(process.cwd(), '.durable-ledger-check-'));
let DurableLedger;
try {
  const cfg = join(out, 'tsconfig.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: process.cwd(),
        // Needed to TYPE-CHECK: durable-ledger's type-only import pulls in
        // reputation.ts, which resolves its own types through `@/`. It changes
        // nothing at runtime, because the import is erased before emit.
        baseUrl: process.cwd(),
        paths: { '@/*': ['./*'] },
        module: 'commonjs',
        target: 'es2022',
        lib: ['es2022', 'dom'],
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
      files: [join(process.cwd(), 'lib/trustshell/persistence/durable-ledger.ts')],
    })
  );
  execFileSync(localTsc(), ['--project', cfg], { stdio: 'pipe' });

  const emitted = readFileSync(
    join(out, 'lib/trustshell/persistence/durable-ledger.js'),
    'utf8'
  );
  // The assumption above, made mechanical.
  if (/require\(/.test(emitted)) {
    rmSync(out, { recursive: true, force: true });
    console.log(
      '\ndurable-ledger — NOT CHECKED. The emitted module now has a runtime require, so the ' +
        'type-only import became a value import. Compile it through compileHarness() instead.'
    );
    process.exit(2);
  }

  ({ DurableLedger } = await import(
    pathToFileURL(join(out, 'lib/trustshell/persistence/durable-ledger.js')).href
  ));
} catch (err) {
  rmSync(out, { recursive: true, force: true });
  // A compile failure is NOT CHECKED, never a pass: nothing was exercised.
  console.log(
    `\ndurable-ledger — NOT CHECKED (compile failed)\n` +
      `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? err.message}`
  );
  process.exit(2);
}

/** A store whose behaviour each case dictates. */
const store = ({ load, save }) => {
  const saved = [];
  return {
    saved,
    load: load ?? (async () => []),
    save:
      save ??
      (async (r) => {
        saved.push([...r]);
      }),
  };
};

// ---------------------------------------------------------------- THE PROPERTY
{
  // Load throws. The turn continues. The save must NOT happen.
  const s = store({
    load: async () => {
      throw new Error('RLS denied');
    },
  });
  const d = new DurableLedger(new ReputationLedger(), s);
  const h = await d.hydrate();
  ok(h.outcome === 'NOT_CHECKED', 'a throwing load is NOT_CHECKED');
  ok(h.applied === 0, 'a failed load applies nothing');
  ok(d.isHydrated === false, 'a failed load leaves the ledger unhydrated');

  const p = await d.persist();
  ok(p.outcome === 'REFUSED', 'persist REFUSES after a failed load');
  ok(s.saved.length === 0, 'THE PROPERTY: the store was never written after a failed load');
  ok(/replace real history/.test(p.detail), 'the refusal says why, in the operator’s words');
}

{
  // Never hydrated at all — the other way to reach an unloaded ledger.
  const s = store({});
  const d = new DurableLedger(new ReputationLedger(), s);
  const p = await d.persist();
  ok(p.outcome === 'REFUSED', 'persist REFUSES when hydrate was never called');
  ok(s.saved.length === 0, 'no write without a hydrate attempt');
  ok(/never called/.test(p.detail), 'the two unloaded reasons are distinguishable');
}

// ---------------------------------------------------------------- EMPTY ≠ UNREADABLE
{
  const s = store({ load: async () => [] });
  const d = new DurableLedger(new ReputationLedger(), s);
  const h = await d.hydrate();
  ok(h.outcome === 'EMPTY', 'a genuinely empty store is EMPTY, not LOADED');
  ok(d.isHydrated === true, 'EMPTY still counts as hydrated');
  const p = await d.persist();
  ok(p.outcome === 'SAVED', 'EMPTY permits a later save — an unscored fleet is a real state');
  ok(s.saved.length === 1, 'the save reached the store');
}

// ---------------------------------------------------------------- ROUND TRIP
{
  const seed = [{ id: 'agent-a', observedScore: 7200, observations: 9 }];
  const s = store({ load: async () => seed });
  const ledger = new ReputationLedger();
  const d = new DurableLedger(ledger, s);
  const h = await d.hydrate();
  ok(h.outcome === 'LOADED' && h.applied === 1, 'records are applied and counted');

  ledger.record('agent-a', true);
  const p = await d.persist();
  ok(p.outcome === 'SAVED', 'a hydrated ledger saves');
  const written = s.saved[0].find((r) => r.id === 'agent-a');
  ok(!!written, 'the written snapshot carries the id');
  ok(
    written.observations === 10,
    'observations survive the round trip — confidence cannot be rebuilt without them'
  );
  ok(written.observedScore !== 7200, 'the new outcome moved the score rather than being dropped');
}

// ---------------------------------------------------------------- STORE FAULTS
{
  const s = store({ load: async () => null });
  const d = new DurableLedger(new ReputationLedger(), s);
  const h = await d.hydrate();
  ok(h.outcome === 'NOT_CHECKED', 'a non-array load is unreadable, NOT empty');
  ok((await d.persist()).outcome === 'REFUSED', 'and it still refuses to save');
}

{
  const s = store({
    load: async () => [],
    save: async () => {
      throw new Error('write timeout');
    },
  });
  const d = new DurableLedger(new ReputationLedger(), s);
  await d.hydrate();
  const p = await d.persist();
  ok(p.outcome === 'NOT_CHECKED', 'a failing save is NOT_CHECKED, never SAVED');
  ok(/nothing about the durable copy is known/.test(p.detail), 'and it says what is unknown');
}

rmSync(out, { recursive: true, force: true });

console.log(`\ndurable-ledger: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAILED: ${f}`);
if (failures.length) {
  console.log('\ndurable-ledger — FAILED.');
  process.exit(1);
}
console.log('durable-ledger — VERIFIED. An unloaded ledger cannot be saved.');
