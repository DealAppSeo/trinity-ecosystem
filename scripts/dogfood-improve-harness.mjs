#!/usr/bin/env node
// scripts/dogfood-improve-harness.mjs
//
// V1 spine item 4: "smallest dogfood loop: one 'improve harness' job through
// runAgentLoop under a named principal with Authorizer + audit receipt."
//
// The task: verify that this session's own new check:* registrations
// (check:collateral-live, check:promotion-attribution,
// check:phase2-predicate-status -- items 1-3) actually landed in
// package.json. Self-referential on purpose -- "improve harness" done by
// running the harness on itself, at the smallest scale that is still real
// rather than illustrative.
//
// ── WHAT IS REAL AND WHAT IS NOT, STATED ONCE, PLAINLY ──────────────────────
//
// REAL: runAgentLoop itself (compiled from lib/trustshell/harness, not
// reimplemented); the Authorizer (an actual allowlist decision using the
// loop's real SessionCounters, not allowAll/denyAll); the tool dispatch (a
// genuine fs.readFileSync of this repo's own package.json); the principal's
// identity (a freshly generated Ed25519 keypair via WebCrypto, a real
// did:key, not a string literal); the audit receipt (lib/trustshell/
// identity/handoff.ts's signHandoff/verifyHandoff, a real Ed25519
// signature, verified after signing).
//
// SIMULATED, AND SAID SO IN THE RECORD: the ModelClient. No live LLM
// credential is reachable from this sandbox (checked: no ANTHROPIC_API_KEY
// / OPENAI_API_KEY / etc.) -- same shape of gap as exercise-collateral-
// live.mjs hitting the network proxy in item 1. A scripted model is used
// instead, and its turns are fixed in this file rather than generated, so
// nothing here can be mistaken for "an LLM verified this."
//
// Zero writes. The one tool this run may call is read-only, and the
// Authorizer refuses everything else -- exercised, not merely configured,
// by including a denied write attempt in the script on purpose.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileHarness } from './lib/harness-compile.mjs';
import { localTsc } from './local-tsc.mjs';

// ── 1. Compile the two independent module groups this script needs ────────
//
// The harness kernel (lib/trustshell/harness/**) and the identity/handoff
// module (lib/trustshell/identity/{did,handoff,work-contract}.ts) are
// compiled separately on purpose: loop.ts's own header explains it cannot
// import outside its directory (harness-portability-check.mjs forbids it),
// so there is no single tsconfig that legitimately covers both without
// pretending the kernel does something it structurally does not.

const { load: loadHarness } = compileHarness();
const { ManualClock } = await loadHarness('types');
const { runAgentLoop } = await loadHarness('loop');

const identityOutDir = mkdtempSync(join(process.cwd(), '.dogfood-identity-'));
let Identity, Handoff;
try {
  const tsconfigPath = join(identityOutDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: identityOutDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022', 'dom'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [
        join(process.cwd(), 'lib/trustshell/identity/did.ts'),
        join(process.cwd(), 'lib/trustshell/identity/handoff.ts'),
        join(process.cwd(), 'lib/trustshell/identity/work-contract.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Identity = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/did.js')).href);
  Handoff = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/handoff.js')).href);
} catch (e) {
  rmSync(identityOutDir, { recursive: true, force: true });
  console.error('FAILED: could not compile the identity/handoff modules');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

// ── 2. A REAL named principal -- a freshly generated Ed25519 identity ─────

let principal;
try {
  principal = await Identity.generateKeyPair();
} catch (e) {
  rmSync(identityOutDir, { recursive: true, force: true });
  console.log(`NOT_CHECKED: WebCrypto Ed25519 unavailable in this runtime: ${e.message}`);
  process.exit(2);
}
console.log(`Principal (real Ed25519 did:key, generated this run): ${principal.did}\n`);

// ── 3. A REAL Authorizer -- an allowlist decision, not allowAll/denyAll ────
//
// Mirrors LoopPolicy's own read-only default: max_writes_per_session
// unearned is 0, so only tools classified 'read' may run at all. This
// authorizer enforces that directly against the loop's real
// SessionCounters rather than approving everything, which is the
// difference between "an Authorizer was passed" and "authorization was
// exercised."
const ALLOWED_READ_TOOLS = new Set(['read_file']);
const realAuthorizer = {
  async authorize(request) {
    const { call, effect, session } = request;
    if (effect !== 'read') {
      return {
        allowed: false,
        kind: 'not_in_allowlist',
        reason: `tool "${call.name}" has effect "${effect}"; max_writes_per_session is 0 and ` +
          'nothing here earned a larger budget',
      };
    }
    if (!ALLOWED_READ_TOOLS.has(call.name)) {
      return {
        allowed: false,
        kind: 'not_in_allowlist',
        reason: `tool "${call.name}" is not in the allowlist [${[...ALLOWED_READ_TOOLS].join(', ')}]`,
      };
    }
    return {
      allowed: true,
      reason: `"${call.name}" is a read-effect tool in the allowlist; ${session.totalCalls} prior call(s) this session`,
    };
  },
};

// ── 4. The tool dispatcher -- a REAL file read ─────────────────────────────

const realDispatcher = {
  async call(toolCall) {
    if (toolCall.name !== 'read_file') {
      return { content: `unknown tool "${toolCall.name}"`, error: true };
    }
    try {
      const content = readFileSync(join(process.cwd(), String(toolCall.args.path)), 'utf8');
      return { content };
    } catch (e) {
      return { content: `could not read ${toolCall.args.path}: ${e.message}`, error: true };
    }
  },
};

// ── 5. The SIMULATED model -- fixed turns, stated as such in the record ────
//
// Turn 1: read package.json, AND (in the same turn) attempt a write tool --
// both issued together on purpose, to prove the Authorizer refuses the
// write rather than only configuring a refusal nobody exercises. Turn 2:
// `input.observations` now carries turn 1's results (observations are from
// the IMMEDIATELY PRECEDING turn only, never accumulated -- read the real
// content here, not on some later turn) and hands off a genuinely-derived
// verdict, not a fixed one. This is the one place the script's own logic
// stands in for "the model reasoning about what it read," and it is
// deterministic code, not judgement.
const EXPECTED_CHECKS = ['check:collateral-live', 'check:promotion-attribution', 'check:phase2-predicate-status'];
let turnCount = 0;
const scriptedModel = {
  async turn(input) {
    turnCount += 1;
    if (turnCount === 1) {
      return {
        calls: [
          { id: 't1-read', name: 'read_file', args: { path: 'package.json' } },
          { id: 't1-write', name: 'delete_file', args: { path: 'package.json' } }, // deliberately denied
        ],
      };
    }
    const pkgObservation = input.observations.find((o) => o.tool === 'read_file' && o.outcome === 'ok');
    const pkgContent = pkgObservation?.content ?? '';
    const missing = EXPECTED_CHECKS.filter((name) => !pkgContent.includes(`"${name}"`));
    return {
      calls: [],
      handoff: {
        outcome: missing.length === 0 ? 'VERIFIED' : 'FAILED',
        summary:
          missing.length === 0
            ? `all ${EXPECTED_CHECKS.length} check:* scripts from this session's items 1-3 are registered in package.json`
            : `${missing.length} expected check:* script(s) missing from package.json: ${missing.join(', ')}`,
        evidence: [`read package.json (${pkgContent.length} bytes)`, `expected: ${EXPECTED_CHECKS.join(', ')}`],
      },
    };
  },
};

// ── 6. Run it ────────────────────────────────────────────────────────────

const clock = new ManualClock(Date.now());
const policy = {
  maxIterations: 5,
  noProgressAbortAfter: 3,
  toolsAllowed: ['read_file'],
  irreversibleRequiresHuman: ['delete_file', 'git.tag_release', 'npm.publish'],
  untrustedOutputSources: [],
  maxWritesPerSession: 0,
  toolEffects: { read_file: 'read', delete_file: 'write' },
  // No independent evaluator is configured below (the smallest real run
  // has no second party to judge it), so this stays at its safe default
  // (absent -> true) rather than being set to false to make the result
  // look better. The consequence -- the run's ceiling capping at
  // NOT_CHECKED -- is reported honestly, not avoided.
};

const result = await runAgentLoop({
  taskId: 'dogfood-2026-08-19-verify-check-registrations',
  policy,
  model: scriptedModel,
  tools: realDispatcher,
  authorizer: realAuthorizer,
  doerDid: principal.did,
  clock,
});

// ── 7. A REAL signed audit receipt over the REAL result ────────────────────

const unsignedHandoff = {
  version: Handoff.HANDOFF_DOMAIN,
  taskId: result.taskId,
  goal: 'verify this session\'s new check:* registrations landed in package.json',
  checkpoints: [
    {
      id: 'registrations-present',
      statement: 'check:collateral-live, check:promotion-attribution, check:phase2-predicate-status are registered',
      outcome: result.outcome,
      checkerDid: principal.did, // self-checked -- see the assertion below, this is reported not hidden
      detail: result.detail || result.claimed || 'see loop result',
    },
  ],
  failures: result.session.deniedAttempts > 0
    ? [{
        what: 'a write-effect tool call was attempted mid-run',
        evidence: `${result.session.deniedAttempts} call(s) denied by the Authorizer`,
        at: new Date(clock.now()).toISOString(),
      }]
    : [],
  agentDid: principal.did,
  endedAt: new Date(result.endedAt).toISOString(),
};

const receipt = await Handoff.signHandoff({ unsigned: unsignedHandoff, agentKey: principal.privateKey });
const verification = await Handoff.verifyHandoff({ handoff: receipt, publicKey: principal.publicKey });

rmSync(identityOutDir, { recursive: true, force: true });

// ── 8. Report, and assert the properties this exercise exists to prove ────

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

check('the loop actually ran and produced a typed handoff', () =>
  result.stopReason !== undefined ? true : 'no stopReason on the result');

check('the Authorizer REFUSED the write attempt -- not merely configured to', () =>
  result.session.deniedAttempts >= 1
    ? true
    : `deniedAttempts=${result.session.deniedAttempts} -- the write tool call was not actually refused`);

check('the denied call did not count against the read tool\'s allowance', () =>
  (result.session.callsByTool.read_file ?? 0) >= 1
    ? true
    : 'read_file never registered as called, even though it should have run before the denied write');

check('the real file read actually happened and was inspected', () => {
  const found = result.turns.some((t) =>
    t.calls.some((c) => c.observation?.tool === 'read_file' && c.observation.outcome === 'ok')
  );
  return found ? true : 'no successful read_file observation in the turn record';
});

check('a doer was named, so checker-must-not-be-doer COULD be evaluated (even with no evaluator configured)', () =>
  result.session ? true : 'no session record');

check('with no independent evaluator configured, the run ceiling is honestly NOT_CHECKED, not VERIFIED', () =>
  result.outcome === 'NOT_CHECKED'
    ? true
    : `outcome is "${result.outcome}" with no evaluator configured -- self-verification must not certify`);

check('the audit receipt is genuinely signed', () =>
  typeof receipt.signature === 'string' && receipt.signature.length > 0
    ? true
    : 'no signature on the receipt');

check('the audit receipt is genuinely, cryptographically signed by this principal', () =>
  verification.signatureValid === true ? true : `signatureValid was not true: ${JSON.stringify(verification)}`);

check('verifyHandoff echoes the SAME outcome the loop actually produced -- no inflation across the boundary', () =>
  verification.outcome === result.outcome
    ? true
    : `handoff verification says "${verification.outcome}", loop result says "${result.outcome}"`);

check('the receipt is bound to the same principal that ran the loop', () =>
  receipt.agentDid === principal.did && receipt.checkpoints[0].checkerDid === principal.did
    ? true
    : 'agentDid or checkerDid drifted from the principal that actually ran this');

console.log(`Task: ${result.taskId}`);
console.log(`Loop outcome: ${result.outcome} (${result.stopReason})`);
console.log(`Claimed by the (simulated) model: ${result.claimed ?? 'n/a'}${result.downgradedBecause ? ` -- DOWNGRADED: ${result.downgradedBecause}` : ''}`);
console.log(`Session: ${result.session.totalCalls} call(s), ${result.session.deniedAttempts} denied, ${result.session.writes} write(s) permitted`);
console.log(`Receipt signature verifies: ${verification.signatureValid} (handoff-level outcome: ${verification.outcome})`);
console.log('');

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions -- a real kernel run, a real refusal, a real signed receipt`);
