#!/usr/bin/env node
// scripts/auditor-grant-test.mjs — the auditor's grant is PROVABLY read-only.
//
// Run: node scripts/auditor-grant-test.mjs
//
// The assertion that carries this file is the one that would not exist if
// "read-only" had been treated as a property of capability strings:
//
//   * 'A READ-LOOKING CAPABILITY THAT REACHES A WRITE IS REFUSED' — `read:*`
//     authorizes a write the moment somebody maps a write tool to
//     `read:reports`. Nothing in the capability algebra objects, because
//     nothing in it knows what the tools do. This is the whole reason the
//     module computes reachability instead of asserting a naming convention.
//   * 'AN UNCLASSIFIED TOOL BLOCKS THE GRANT' — same rule as the loop's write
//     budget. A tool nobody labelled is one nobody measured.
//   * 'the refusal NAMES the offending tool and the capability that opened it'
//     — "not read-only" is not actionable; "reaches deploy.publish via ops:*" is.
//   * 'an agent may not hold a grant to audit itself' — checked here as well as
//     in the contract, because a delegation chain verifies perfectly whether or
//     not the delegate is the agent under audit.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.auditor-grant-check-'));
let did, identity, cp, ag;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/identity.ts',
      'lib/trustshell/identity/control-proof.ts',
      'lib/trustshell/identity/delegation.ts',
      'lib/trustshell/identity/auditor-grant.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell', 'identity');
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  identity = await import(pathToFileURL(join(base, 'identity.js')).href);
  cp = await import(pathToFileURL(join(base, 'control-proof.js')).href);
  ag = await import(pathToFileURL(join(base, 'auditor-grant.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('auditor-grant compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { analyseReadOnly, delegateAuditorGrant, NotReadOnly } = ag;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = async (fn, re, what) => {
  try { await fn(); } catch (e) { if (!re.test(e.message)) throw new Error(`${what}: wrong error ${JSON.stringify(e.message)}`); return e; }
  throw new Error(`${what}: expected a throw, got none`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const TOOL_CAPS = {
  'vault.read':     'vault:read',
  'memory.recall':  'memory:recall',
  'report.publish': 'report:publish',
  'bash':           'shell:exec',
};
const EFFECTS = {
  'vault.read':     'read',
  'memory.recall':  'read',
  'report.publish': 'write',
  'bash':           'unknown',
};

const analyse = (capabilities, over = {}) =>
  analyseReadOnly({
    capabilities,
    toolCapabilities: over.toolCapabilities ?? TOOL_CAPS,
    toolEffects: over.toolEffects ?? EFFECTS,
  });

// ── the analysis ────────────────────────────────────────────────────────────

await check('a genuinely read-only capability set is read-only', () => {
  const r = analyse(['vault:read', 'memory:recall']);
  eq(r.readOnly, true, 'reads only must be read-only');
  eq(r.reaches.length, 0, 'nothing reachable');
  eq(r.unclassified.length, 0, 'nothing unclassified');
});

await check('A READ-LOOKING CAPABILITY THAT REACHES A WRITE IS REFUSED', () => {
  // The reason this module computes rather than asserts. `read:*` looks
  // read-only in every log and every review, and authorizes a write the moment
  // somebody maps a write tool to a capability under that prefix. Nothing in
  // the capability algebra objects — it does not know what the tools do.
  const toolCapabilities = { ...TOOL_CAPS, 'report.publish': 'read:reports' };
  const r = analyse(['read:*'], { toolCapabilities });
  eq(r.readOnly, false, "'read:*' reaching a write tool must not be read-only");
  eq(r.reaches.length, 1, 'exactly the one write tool');
  eq(r.reaches[0].tool, 'report.publish', 'named');
  eq(r.reaches[0].grantedBy, 'read:*', 'and the capability that opened it is named');
});

await check('the refusal NAMES the offending tool and the capability that opened it', () => {
  // "This grant is not read-only" is not actionable.
  const r = analyse(['vault:*', 'report:*']);
  match(r.detail, /report\.publish \(write\) via 'report:\*'/, 'the detail must name tool, effect and grant');
});

await check('AN UNCLASSIFIED TOOL BLOCKS THE GRANT', () => {
  // Same rule as the loop's write budget: rm -rf and git status arrive through
  // the same tool. An unlabelled tool is one nobody measured.
  const r = analyse(['vault:read'], { toolEffects: { 'memory.recall': 'read' } });
  eq(r.readOnly, false, 'an unclassified reachable tool must block');
  eq(r.unclassified, ['vault.read'], 'and be named');
  eq(r.reaches.length, 0, 'it is not a "reach" — it is missing configuration');
  match(r.detail, /classify it/, 'the detail must point at the right fix');
});

await check("'unknown' is treated as a write, not as a read", () => {
  const r = analyse(['shell:exec']);
  eq(r.readOnly, false, 'an unknown-effect tool must block');
  eq(r.reaches[0].effect, 'unknown', 'recorded as unknown, not silently as write');
});

await check('unreachable write tools are NOT a concern', () => {
  // The analysis is about what this capability set opens, not about what exists.
  // Flagging tools the grant cannot reach would make every grant unmintable.
  const r = analyse(['vault:read']);
  eq(r.readOnly, true, 'write tools the grant cannot reach must not block it');
  truthy(Object.keys(TOOL_CAPS).length > 1, 'sanity: the map does contain write tools');
});

await check('a narrower capability does not open a broader tool', () => {
  // `vault:read` must not reach a tool requiring `vault:write`.
  const r = analyse(['vault:read'], {
    toolCapabilities: { 'vault.write': 'vault:write' },
    toolEffects: { 'vault.write': 'write' },
  });
  eq(r.readOnly, true, 'a sibling capability must not permit');
});

await check('an EMPTY capability set is read-only — it opens nothing', () => {
  const r = analyse([]);
  eq(r.readOnly, true, 'granting nothing reaches nothing');
});

// ── minting ─────────────────────────────────────────────────────────────────

const mk = (name) => identity.createAgentIdentity(name, { exportable: true });

const human = await mk('human');
const operator = await mk('operator');
const auditor = await mk('auditor');
const doer = await mk('doer');

const parentProof = await cp.issueControlProof({
  human, agent: operator, audience: 'aud', capabilities: ['vault:*', 'memory:*', 'report:*'], ttlSeconds: 3600,
});

const mint = (over = {}) => delegateAuditorGrant({
  parent: parentProof,
  delegator: operator,
  auditor,
  doerDid: doer.did,
  capabilities: ['vault:read', 'memory:recall'],
  toolCapabilities: TOOL_CAPS,
  toolEffects: EFFECTS,
  ttlSeconds: 600,
  ...over,
});

await check('a provably read-only grant mints, and carries its own proof', async () => {
  const { proof, analysis } = await mint();
  truthy(proof, 'a delegated proof must be produced');
  eq(analysis.readOnly, true, 'and it must carry the analysis that justified it');
  match(analysis.detail, /no tool with effect/, 'the analysis must say what it established');
});

await check('MINTING IS REFUSED when the grant is not provably read-only', async () => {
  // Refused at MINT time, not reported at verify time. A grant that exists gets
  // passed around and trusted by its description.
  const e = await throws(
    () => mint({ capabilities: ['vault:read', 'report:publish'] }),
    /not provably read-only/,
    'a write-reaching grant was minted'
  );
  eq(e.name, 'NotReadOnly', 'a typed error, so a caller can distinguish it');
  truthy(e.analysis, 'and it must carry the analysis');
  eq(e.analysis.reaches[0].tool, 'report.publish', 'naming the offender');
});

await check('minting is refused when a reachable tool is unclassified', async () => {
  const e = await throws(
    () => mint({ toolEffects: { 'memory.recall': 'read' } }),
    /does not classify/,
    'an unclassified reachable tool was allowed through'
  );
  eq(e.name, 'NotReadOnly', 'typed');
});

await check('AN AGENT MAY NOT HOLD A GRANT TO AUDIT ITSELF', async () => {
  // Checked here as well as in the contract, deliberately (LESSONS A13): a
  // delegation chain verifies perfectly whether or not the delegate happens to
  // be the agent under audit, so nothing else on this path would notice.
  await throws(
    () => mint({ doerDid: auditor.did }),
    /constitutional/,
    'an agent was granted authority to audit itself'
  );
});

await check('whitespace does not defeat the self-audit check', async () => {
  await throws(
    () => mint({ doerDid: ` ${auditor.did} ` }),
    /constitutional/,
    'a padded DID bought a self-audit grant'
  );
});

await check('THE READ-ONLY CHECK RUNS BEFORE THE DELEGATION IS SIGNED', async () => {
  // Ordering matters: if delegate() ran first, a refused grant would still have
  // consumed a nonce and produced signed bytes somewhere in memory. The
  // observable proxy is that a capability the PARENT does not hold still fails
  // the read-only check first, with the read-only error rather than the
  // widening error.
  await throws(
    () => mint({ capabilities: ['deploy:*'], toolCapabilities: { 'deploy.go': 'deploy:*' }, toolEffects: { 'deploy.go': 'write' } }),
    /not provably read-only/,
    'the read-only check must run before delegation'
  );
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nauditor-grant: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All auditor-grant checks passed.');
