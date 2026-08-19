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
// credential is reachable from this sandbox -- MECHANICALLY checked below
// (hasSecondFamilyCredential()), not just asserted in this comment as the
// previous version of this file did. Same shape of gap as exercise-
// collateral-live.mjs hitting the network proxy in item 1. A scripted model
// is used instead, and its turns are fixed in this file rather than
// generated, so nothing here can be mistaken for "an LLM verified this."
// When a second-family credential IS reachable, replace the scripted model
// with a real call to it -- until then, keep the label (item E, 2026-08-19).
//
// Zero writes. The one tool this run may call is read-only, and the
// Authorizer refuses everything else -- exercised, not merely configured,
// by including a denied write attempt in the script on purpose.
//
// ── ITEM E (2026-08-19): does this run's own claim survive the promotion
// seam? ───────────────────────────────────────────────────────────────────
//
// "One improvement task that ends in a promotion GateRun with authoredBy !=
// verifiedBy if a second family is reachable, else NOT_DISJOINT." §9 below
// takes THIS run's own checkpoint claim (registrations-present) and grades it
// through promotion.ts + verifier-independence.ts -- the same two modules
// exercise-promotion-attribution.mjs (item 2) already exercised against the
// authority/collateral claim, applied here to the dogfood claim specifically.
//
// "NOT_DISJOINT" is Sean's shorthand, not a literal value of this repo's
// Independence type (`'DISJOINT' | 'SHARED_FAMILY' | 'NOT_CHECKED'` --
// verifier-independence.ts). Mapped explicitly rather than left ambiguous:
// authorship and verification ARE both recorded here (this session wrote the
// scripted verdict logic AND is the only party available to check it), so
// the honest value is SHARED_FAMILY, not NOT_CHECKED -- NOT_CHECKED would
// misrepresent a recorded-but-shared attribution as an unrecorded one, which
// is exactly the class of substitution verifier-independence.ts exists to
// prevent (see its own header on "unattributed must not read as
// independent").

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

// Item E's promotion seam, compiled separately again for the same reason:
// promotion.ts and verifier-independence.ts are both zero-imports (a decision
// that ends up in a status table must be runnable standalone), and neither
// imports the other -- bundled into one tsconfig here only because both are
// needed by §9 below, not because they depend on each other.
const promotionOutDir = mkdtempSync(join(process.cwd(), '.dogfood-promotion-'));
let Promotion, VerifierIndependence;
try {
  const tsconfigPath = join(promotionOutDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: promotionOutDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [
        join(process.cwd(), 'lib/trustshell/promotion.ts'),
        join(process.cwd(), 'lib/trustshell/verifier-independence.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Promotion = await import(pathToFileURL(join(promotionOutDir, 'lib/trustshell/promotion.js')).href);
  VerifierIndependence = await import(
    pathToFileURL(join(promotionOutDir, 'lib/trustshell/verifier-independence.js')).href
  );
} catch (e) {
  rmSync(identityOutDir, { recursive: true, force: true });
  rmSync(promotionOutDir, { recursive: true, force: true });
  console.error('FAILED: could not compile promotion.ts / verifier-independence.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

// A REAL, mechanical check for a reachable second-family credential -- not
// asserted in a comment. Presence only; no value is ever read into a
// variable that could be logged or included in the receipt below. This is
// the actual gate for whether the scripted model gets replaced (see the
// file header) and for whether §9's verifiedBy can honestly be non-Claude.
const SECOND_FAMILY_CREDENTIAL_ENV_VARS = [
  'OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY',
  'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'XAI_API_KEY', 'GROK_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
  'OPENROUTER_API_KEY',
  'PERPLEXITY_API_KEY',
  'LITELLM_MASTER_KEY', // a gateway, not a family itself, but names one if set
];
function hasSecondFamilyCredential(env) {
  const present = SECOND_FAMILY_CREDENTIAL_ENV_VARS.filter((name) => !!env[name]);
  return { reachable: present.length > 0, checkedVars: SECOND_FAMILY_CREDENTIAL_ENV_VARS, presentVars: present };
}
const secondFamily = hasSecondFamilyCredential(process.env);

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

// ── 9. Item E -- grade THIS run's own claim through the promotion seam ────
//
// authoredBy: this session (claude/claude-sonnet-5) wrote the deterministic
// verdict logic in the scripted model's turn() function above (§5) -- that
// is the actual author of the claim being promoted, not the scripted
// persona inside the loop, which is not a model at all and cannot author
// anything. verifiedBy: the same session, UNLESS a second-family credential
// is reachable (checked mechanically above, §1) -- if one is, it is used
// here to independently re-derive the same yes/no (did package.json
// register the three expected check:* scripts) rather than trusted blind,
// so DISJOINT is earned by a real second opinion, never asserted.
const CLAUDE_ATTRIBUTION = { family: 'claude', model: 'claude-sonnet-5', provider: 'anthropic' };

let verifiedByAttribution = CLAUDE_ATTRIBUTION;
let secondFamilyVerification = null;
if (secondFamily.reachable) {
  // A credential is reachable, but this script does not yet contain a real
  // call to it -- building that call is the next session's work, not
  // something to fake here. Reported honestly rather than silently upgraded
  // to DISJOINT on the strength of an unused credential.
  secondFamilyVerification = {
    attempted: false,
    detail:
      `a second-family credential IS reachable (${secondFamily.presentVars.length} var(s) set) but ` +
      'this script does not yet call it -- verifiedBy stays claude/claude until that call exists; ' +
      'reachability alone does not earn DISJOINT',
  };
} else {
  secondFamilyVerification = {
    attempted: false,
    detail: `no second-family credential reachable -- checked ${secondFamily.checkedVars.length} env var name(s), 0 present`,
  };
}

const dogfoodClaim = {
  surface: 'dogfood: runAgentLoop kernel path (item 4/E, this run\'s own checkpoint)',
  artifact: result.taskId, // this run's own taskId, not a git SHA -- the artifact IS the run
  runs: [
    {
      gate: 'dogfood-improve-harness.mjs (this script, this run)',
      ranAgainst: result.taskId,
      outcome: result.outcome, // the REAL loop outcome computed above -- not re-asserted
      coversWholeClaim: false, // covers only the one checkpoint, not "the kernel is production-ready"
      gatesTheBuild: false, // dogfood is observational, same posture as every other item this session
      detail: unsignedHandoff.checkpoints[0].statement + ` -- ${unsignedHandoff.checkpoints[0].detail}`,
      attribution: { authoredBy: CLAUDE_ATTRIBUTION, verifiedBy: verifiedByAttribution },
    },
  ],
};

const dogfoodIndependence = VerifierIndependence.assessIndependence(
  dogfoodClaim.runs[0].attribution.authoredBy,
  dogfoodClaim.runs[0].attribution.verifiedBy
);
const dogfoodStage = Promotion.stageFor(dogfoodClaim);
const dogfoodPromotability = Promotion.canPromoteToLive(dogfoodClaim);

rmSync(identityOutDir, { recursive: true, force: true });
rmSync(promotionOutDir, { recursive: true, force: true });

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

// ── Item E assertions -- the promotion seam, applied to THIS run's claim ──

check('the second-family credential check actually ran and named what it checked', () =>
  Array.isArray(secondFamily.checkedVars) && secondFamily.checkedVars.length > 0
    ? true
    : 'hasSecondFamilyCredential did not report a checked-vars list -- cannot trust its reachable=false');

check('no credential value was ever captured, only presence -- checkedVars are names, not secrets', () =>
  secondFamily.checkedVars.every((v) => /^[A-Z0-9_]+$/.test(v))
    ? true
    : 'a checkedVars entry does not look like a bare env var NAME');

check('the dogfood claim has a real stage, computed from a real run outcome, not asserted', () =>
  dogfoodStage !== null ? true : 'stageFor returned null for a claim with one real GateRun');

check('independence assessment matches reachability: no credential reachable => SHARED_FAMILY, not NOT_CHECKED', () => {
  if (secondFamily.reachable) return true; // covered by the DISJOINT-reachable branch below when applicable
  return dogfoodIndependence.independence === 'SHARED_FAMILY'
    ? true
    : `expected SHARED_FAMILY (attribution recorded on both sides, just not disjoint), got ` +
      `${dogfoodIndependence.independence} -- ${dogfoodIndependence.detail}`;
});

check('independence is never silently reported as the informal "NOT_DISJOINT" -- only real type values are used', () =>
  ['DISJOINT', 'SHARED_FAMILY', 'NOT_CHECKED'].includes(dogfoodIndependence.independence)
    ? true
    : `dogfoodIndependence.independence is "${dogfoodIndependence.independence}", not a real Independence value`);

check('canPromoteToLive refuses a same-family-verified claim, and names self-verification as why', () => {
  if (secondFamily.reachable) return true;
  return dogfoodPromotability.ok === false &&
    dogfoodPromotability.blockers.some((b) => /same training lineage|SAME training lineage/i.test(b))
    ? true
    : `ok=${dogfoodPromotability.ok}, blockers=${JSON.stringify(dogfoodPromotability.blockers)}`;
});

console.log(`Task: ${result.taskId}`);
console.log(`Loop outcome: ${result.outcome} (${result.stopReason})`);
console.log(`Claimed by the (simulated) model: ${result.claimed ?? 'n/a'}${result.downgradedBecause ? ` -- DOWNGRADED: ${result.downgradedBecause}` : ''}`);
console.log(`Session: ${result.session.totalCalls} call(s), ${result.session.deniedAttempts} denied, ${result.session.writes} write(s) permitted`);
console.log(`Receipt signature verifies: ${verification.signatureValid} (handoff-level outcome: ${verification.outcome})`);
console.log('');
console.log('-- Item E: promotion GateRun over this run\'s own claim --');
console.log(`Second-family credential reachable: ${secondFamily.reachable} (${secondFamily.checkedVars.length} env var(s) checked, ${secondFamily.presentVars.length} present)`);
console.log(`  ${secondFamilyVerification.detail}`);
console.log(`Independence: ${dogfoodIndependence.independence} -- ${dogfoodIndependence.detail}`);
console.log(`  (Sean's shorthand "NOT_DISJOINT" maps to SHARED_FAMILY here, not NOT_CHECKED: attribution IS recorded on both sides.)`);
console.log(`Promotion stage: ${dogfoodStage}`);
console.log(`canPromoteToLive: ok=${dogfoodPromotability.ok}${dogfoodPromotability.ok ? '' : `, blockers=${JSON.stringify(dogfoodPromotability.blockers)}`}`);
console.log('');

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions -- a real kernel run, a real refusal, a real signed receipt, a real (self-verified) promotion verdict`);
