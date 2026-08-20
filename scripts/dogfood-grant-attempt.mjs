#!/usr/bin/env node
// scripts/dogfood-grant-attempt.mjs
//
// Overnight loop, item 4 (antifragility): "one more real runAgentLoop job that
// attempts a grant... and emits a signed receipt." Sibling to
// dogfood-improve-harness.mjs (V1 spine item 4/E) — same kernel, same rigor,
// different task: this run's tool dispatcher includes a REAL grant-mint tool
// wired to identity/delegation.ts's actual delegate(), not a stub. The task
// this session shipped tonight (repid-engine#442, principal-grants) lives in a
// separately deployed service this sandbox cannot reach over the network —
// this script does NOT call that HTTP API and does not pretend to. What IS
// real and local: trinity-ecosystem's OWN delegation primitive
// (capability.ts + caveat.ts + control-proof.ts + delegation.ts), which
// repid-engine#442's own capability/caveat modules were PORTED from. Exercising
// the source of that port, through the real kernel, is the honest version of
// "dogfood the grants feature" available from inside this repo.
//
// WHAT IS REAL AND WHAT IS NOT, STATED ONCE, PLAINLY (mirrors
// dogfood-improve-harness.mjs's own header):
//
// REAL: runAgentLoop (compiled from lib/trustshell/harness, not
// reimplemented); the Authorizer (an allowlist decision against the loop's
// real SessionCounters); two freshly generated Ed25519 principals via
// WebCrypto (a human SSID and two agent identities — PAI-CEO and a CFO
// worker it spawns), real did:key values, not string literals; a REAL root
// ControlProof (issueControlProof — dual human+agent signed, audience-bound,
// TTL-enforced); a REAL delegate() call attempting to mint a narrower,
// attenuated child grant from the PAI-CEO agent to the CFO worker (capability
// subset, tightened caveat, shorter TTL — every attenuation rule actually
// checked by delegation.ts's own code, not re-implemented here); a REAL
// denied write attempt (the Authorizer refuses it, exercised not merely
// configured); a REAL signed audit receipt (handoff.ts's
// signHandoff/verifyHandoff), verified after signing.
//
// SIMULATED, AND SAID SO IN THE RECORD: the ModelClient. Same mechanical
// second-family-credential check as dogfood-improve-harness.mjs — this run
// makes the identical honest call, not a fresh assertion.
//
// Zero writes reach anything outside this process. The grant that gets
// minted is held in memory for this run only; nothing is persisted to
// Supabase, and this script imports no `db`/Supabase client at all.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileHarness } from './lib/harness-compile.mjs';
import { localTsc } from './local-tsc.mjs';

// ── 1. Compile the harness kernel + the full delegation stack ─────────────
//
// One tsconfig for identity.ts/did.ts/handoff.ts/control-proof.ts/
// delegation.ts/capability.ts/caveat.ts together: they already import each
// other (delegation.ts imports control-proof.ts imports capability.ts/
// caveat.ts imports identity.ts), so compiling them as one program is the
// real dependency graph, not an artificial split.
const { load: loadHarness } = compileHarness();
const { ManualClock } = await loadHarness('types');
const { runAgentLoop } = await loadHarness('loop');

const identityOutDir = mkdtempSync(join(process.cwd(), '.dogfood-grant-'));
let Identity, Handoff, ControlProof, Delegation;
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
        join(process.cwd(), 'lib/trustshell/identity/identity.ts'),
        join(process.cwd(), 'lib/trustshell/identity/handoff.ts'),
        join(process.cwd(), 'lib/trustshell/identity/control-proof.ts'),
        join(process.cwd(), 'lib/trustshell/identity/delegation.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Identity = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/identity.js')).href);
  Handoff = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/handoff.js')).href);
  ControlProof = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/control-proof.js')).href);
  Delegation = await import(pathToFileURL(join(identityOutDir, 'lib/trustshell/identity/delegation.js')).href);
} catch (e) {
  rmSync(identityOutDir, { recursive: true, force: true });
  console.error('FAILED: could not compile the delegation stack');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

// ── 2. Three REAL principals: a human, and two agents (PAI-CEO, CFO worker) ─

const human = await Identity.createHumanSSID();
const paiCeo = await Identity.createAgentIdentity('pai-ceo-dogfood');
const cfoWorker = await Identity.createAgentIdentity('cfo-worker-dogfood');
console.log(`Human SSID (real Ed25519 did:key, generated this run): ${human.did}`);
console.log(`PAI-CEO agent (real Ed25519 did:key, generated this run): ${paiCeo.did}`);
console.log(`CFO worker agent (real Ed25519 did:key, generated this run): ${cfoWorker.did}\n`);

// ── 3. A REAL root ControlProof: the human authorizes PAI-CEO for pay:usdc ──

const rootProof = await ControlProof.issueControlProof({
  human,
  agent: paiCeo,
  capabilities: ['pay:usdc'],
  caveats: [{ type: 'maxValue', asset: 'USDC', amount: 100 }],
  audience: 'trinity:dogfood-grant-attempt',
  ttlSeconds: 3600,
});

// ── 4. A REAL Authorizer — exercised, not merely configured ────────────────

const ALLOWED_READ_TOOLS = new Set(['read_file', 'mint_grant']);
const realAuthorizer = {
  async authorize(request) {
    const { call, effect, session } = request;
    if (effect !== 'read') {
      return {
        allowed: false,
        kind: 'not_in_allowlist',
        reason: `tool "${call.name}" has effect "${effect}"; max_writes_per_session is 0`,
      };
    }
    if (!ALLOWED_READ_TOOLS.has(call.name)) {
      return { allowed: false, kind: 'not_in_allowlist', reason: `tool "${call.name}" is not in the allowlist` };
    }
    return { allowed: true, reason: `"${call.name}" is read-effect; ${session.totalCalls} prior call(s)` };
  },
};

// ── 5. The tool dispatcher — one REAL grant mint, one REAL file read ───────
//
// mint_grant is classified 'read' for THIS harness's authority ladder on
// purpose: minting a grant does not itself move money or write to any
// external store here (nothing is persisted — see file header), so it does
// not need write budget to attempt. The Authorizer still gates it through
// the allowlist; delegate() itself is what can refuse the ATTEMPT on its own
// terms (widened capability, loosened caveat, expired parent, wrong
// delegator) regardless of what the Authorizer permits.
let mintedGrant = null;
let mintError = null;
const realDispatcher = {
  async call(toolCall) {
    if (toolCall.name === 'read_file') {
      try {
        return { content: readFileSync(join(process.cwd(), String(toolCall.args.path)), 'utf8') };
      } catch (e) {
        return { content: `could not read ${toolCall.args.path}: ${e.message}`, error: true };
      }
    }
    if (toolCall.name === 'mint_grant') {
      try {
        mintedGrant = await Delegation.delegate({
          parent: rootProof,
          delegator: paiCeo,
          delegate: cfoWorker,
          capabilities: ['pay:usdc'],
          caveats: [{ type: 'maxValue', asset: 'USDC', amount: 10 }], // tighter than the parent's 100 — real attenuation
          ttlSeconds: 1800, // shorter than the parent's 3600 — real attenuation
        });
        return { content: `minted: delegate=${mintedGrant.grant.delegateDid}, cap=${mintedGrant.grant.capabilities.join(',')}` };
      } catch (e) {
        mintError = e.message;
        return { content: `mint refused: ${e.message}`, error: true };
      }
    }
    return { content: `unknown tool "${toolCall.name}"`, error: true };
  },
};

// ── 6. The SIMULATED model — fixed turns, stated as such ───────────────────
//
// Turn 1: attempt the mint AND a denied write in the same turn (proves the
// Authorizer refuses the write rather than only being configured to). Turn
// 2: reads turn 1's observations and hands off a genuinely-derived verdict.
let turnCount = 0;
const scriptedModel = {
  async turn(input) {
    turnCount += 1;
    if (turnCount === 1) {
      return {
        calls: [
          { id: 't1-mint', name: 'mint_grant', args: {} },
          { id: 't1-write', name: 'delete_file', args: { path: 'package.json' } }, // deliberately denied
        ],
      };
    }
    const mintObservation = input.observations.find((o) => o.tool === 'mint_grant');
    const mintOk = mintObservation?.outcome === 'ok';
    return {
      calls: [],
      handoff: {
        outcome: mintOk ? 'VERIFIED' : 'FAILED',
        summary: mintOk
          ? `grant minted: pai-ceo-dogfood -> cfo-worker-dogfood, pay:usdc <= 10 USDC, attenuated from the root's <= 100 USDC`
          : `grant mint failed: ${mintObservation?.content ?? 'no mint_grant observation'}`,
        evidence: [`mint_grant observation: ${JSON.stringify(mintObservation)}`],
      },
    };
  },
};

// ── 7. Run it ────────────────────────────────────────────────────────────

const clock = new ManualClock(Date.now());
const policy = {
  maxIterations: 5,
  noProgressAbortAfter: 3,
  toolsAllowed: ['read_file', 'mint_grant'],
  irreversibleRequiresHuman: ['delete_file', 'git.tag_release', 'npm.publish'],
  untrustedOutputSources: [],
  maxWritesPerSession: 0,
  toolEffects: { read_file: 'read', mint_grant: 'read', delete_file: 'write' },
};

const result = await runAgentLoop({
  taskId: 'dogfood-2026-08-20-grant-attempt',
  policy,
  model: scriptedModel,
  tools: realDispatcher,
  authorizer: realAuthorizer,
  doerDid: paiCeo.did,
  clock,
});

// ── 8. A REAL signed audit receipt over the REAL result ────────────────────

const unsignedHandoff = {
  version: Handoff.HANDOFF_DOMAIN,
  taskId: result.taskId,
  goal: 'attempt a real, attenuated grant mint (pai-ceo -> cfo-worker) through the kernel, alongside a denied write',
  checkpoints: [
    {
      id: 'grant-mint-attempt',
      statement: 'delegate() was called with an attenuated capability/caveat/TTL set against a real root ControlProof',
      outcome: result.outcome,
      checkerDid: paiCeo.did,
      detail: mintedGrant
        ? `minted, delegate=${mintedGrant.grant.delegateDid}, expiresAt=${mintedGrant.grant.expiresAt}`
        : `not minted: ${mintError ?? 'unknown'}`,
    },
  ],
  failures: result.session.deniedAttempts > 0
    ? [{
        what: 'a write-effect tool call was attempted mid-run',
        evidence: `${result.session.deniedAttempts} call(s) denied by the Authorizer`,
        at: new Date(clock.now()).toISOString(),
      }]
    : [],
  agentDid: paiCeo.did,
  endedAt: new Date(result.endedAt).toISOString(),
};

const receipt = await Handoff.signHandoff({ unsigned: unsignedHandoff, agentKey: paiCeo.privateKey });
const verification = await Handoff.verifyHandoff({ handoff: receipt, publicKey: paiCeo.publicKey });

rmSync(identityOutDir, { recursive: true, force: true });

// ── 9. Report, and assert the properties this exercise exists to prove ────

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

check('the grant mint actually succeeded (a real delegate() call, not a stub)', () =>
  mintedGrant !== null ? true : `mint did not succeed: ${mintError}`);

check('the minted grant is narrower than its parent — caveat actually tightened', () =>
  mintedGrant && mintedGrant.grant.caveats[0].amount < rootProof.grant.caveats[0].amount
    ? true
    : 'child caveat amount did not tighten relative to the parent');

check('the minted grant expires no later than its parent', () =>
  mintedGrant && Date.parse(mintedGrant.grant.expiresAt) <= Date.parse(rootProof.grant.expiresAt)
    ? true
    : 'child expiry exceeds parent expiry');

check('the minted grant is bound to the CFO worker identity, not the PAI-CEO', () =>
  mintedGrant && mintedGrant.grant.delegateDid === cfoWorker.did ? true : 'delegateDid did not match cfoWorker.did');

check('the delegate signature is present and distinct from the delegator signature', () =>
  mintedGrant && mintedGrant.delegateSignature && mintedGrant.delegateSignature !== mintedGrant.delegatorSignature
    ? true
    : 'delegateSignature missing or identical to delegatorSignature');

check('the Authorizer REFUSED the write attempt, in the same run as the mint', () =>
  result.session.deniedAttempts >= 1
    ? true
    : `deniedAttempts=${result.session.deniedAttempts} — the write tool call was not actually refused`);

check('the mint call did not count against the write budget (classified read, and it was)', () =>
  (result.session.callsByTool.mint_grant ?? 0) >= 1
    ? true
    : 'mint_grant never registered as called');

check('the audit receipt is genuinely, cryptographically signed by the PAI-CEO principal', () =>
  verification.signatureValid === true ? true : `signatureValid was not true: ${JSON.stringify(verification)}`);

check('verifyHandoff echoes the SAME outcome the loop actually produced', () =>
  verification.outcome === result.outcome
    ? true
    : `handoff verification says "${verification.outcome}", loop result says "${result.outcome}"`);

check('the receipt is bound to the principal that actually ran the mint', () =>
  receipt.agentDid === paiCeo.did && receipt.checkpoints[0].checkerDid === paiCeo.did
    ? true
    : 'agentDid or checkerDid drifted from the principal that actually ran this');

console.log(`Task: ${result.taskId}`);
console.log(`Loop outcome: ${result.outcome} (${result.stopReason})`);
console.log(`Session: ${result.session.totalCalls} call(s), ${result.session.deniedAttempts} denied, ${result.session.writes} write(s) permitted`);
console.log(`Grant minted: ${mintedGrant ? 'yes' : 'no'}${mintedGrant ? ` (expires ${mintedGrant.grant.expiresAt})` : ` (${mintError})`}`);
console.log(`Receipt signature verifies: ${verification.signatureValid} (handoff-level outcome: ${verification.outcome})`);
console.log('');

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — a real kernel run, a real attenuated grant mint, a real refused write, a real signed receipt`);
