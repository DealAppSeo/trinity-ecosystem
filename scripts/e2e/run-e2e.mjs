#!/usr/bin/env node
//
// run-e2e.mjs — end-to-end run of the TrustRails payment path.
//
// WHAT IS REAL HERE, AND WHAT IS NOT. Stated up front because this repo's
// recurring defect is a system reporting success it has not earned:
//
//   REAL — a production Next server (`next start`), the real route handlers,
//          the real lib/trustshell modules, real supabase-js, real HTTP.
//   FAKE — the database (scripts/e2e/postgrest-stub.mjs), because the sandbox
//          proxy denies the Supabase host.
//   NOT TESTED — Solana broadcast and live Supabase. Both are recorded as
//          NOT CHECKED rather than skipped silently.
//
// Usage:
//   node scripts/e2e/run-e2e.mjs [--no-build] [--strict] [--keep-server]
//   E2E_STRICT=1 npm run test:e2e
//
// --strict makes NOT CHECKED fatal. Do not set it in this sandbox: Solana devnet
// is genuinely unreachable here, and forcing it green would be the lie.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import { createPostgrestStub } from './postgrest-stub.mjs';
import { VerificationLedger } from './ledger.mjs';
import { buildSeed, AGENTS } from './seed.mjs';
import { loadIdentity } from './identity-client.mjs';

const argv = new Set(process.argv.slice(2));
const strict = argv.has('--strict') || process.env.E2E_STRICT === '1';
const skipBuild = argv.has('--no-build');

const CORE_STEPS = [
  'server_boot',
  'control_proof_verifies_over_http',
  'forged_control_proof_rejected_over_http',
  'pay_approved_with_measured_repid',
  'repid_differs_between_agents',
  'unmeasured_scores_zero_not_default',
  'no_fabricated_proof_in_response',
  'settlement_reports_simulated',
  'bft_reports_not_checked_in_observe_mode',
  'receipt_persisted',
];

const ledger = new VerificationLedger({ strict, coreSteps: CORE_STEPS });

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    child.on('error', reject);
  });
}

/**
 * Refuse to run --no-build against a build older than the source.
 *
 * This bit: seven identity steps failed with `<!DOCTYPE` because `.next`
 * predated the route they exercise, and the suite reported it as seven broken
 * assertions rather than "you are testing yesterday's build". The false-failure
 * direction is the lucky one — a stale build can equally hide a regression, or
 * keep passing a route that has since been deleted, which is a green run over
 * code that no longer exists.
 *
 * Fails rather than warns. A warning in a scrollback of build output is how
 * this got missed the first time.
 */
function assertBuildIsFresh() {
  const buildId = '.next/BUILD_ID';
  if (!existsSync(buildId)) {
    throw new Error('--no-build was passed but .next/BUILD_ID does not exist; run a build first');
  }
  const builtAt = statSync(buildId).mtimeMs;

  let newest = { path: null, at: 0 };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = pathJoin(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs|json)$/.test(entry.name)) continue;
      const at = statSync(full).mtimeMs;
      if (at > newest.at) newest = { path: full, at };
    }
  };
  for (const dir of ['app', 'lib']) if (existsSync(dir)) walk(dir);

  if (newest.at > builtAt) {
    throw new Error(
      `--no-build was passed but ${newest.path} is newer than .next/BUILD_ID ` +
      `(${new Date(newest.at).toISOString()} > ${new Date(builtAt).toISOString()}).\n` +
      'The run would exercise a stale build: routes added since the build 404, and ' +
      'routes deleted since the build still answer. Re-run without --no-build.'
    );
  }
}

async function waitForServer(base, { timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'never attempted';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/version`, { cache: 'no-store' });
      if (res.ok) return await res.json();
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err?.cause?.code ?? err.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms (last: ${lastErr})`);
}

async function postPay(base, body, { institution } = {}) {
  const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
  const res = await fetch(`${base}/api/trustrails/pay${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`pay returned non-JSON (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: json };
}

const RECIPIENT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

let server;
let stub;

try {
  // ---- database stub -------------------------------------------------------
  const seed = buildSeed();
  stub = createPostgrestStub(seed);
  const stubUrl = await stub.listen();
  console.log(`postgrest stub listening on ${stubUrl}`);

  // ---- build ---------------------------------------------------------------
  if (!skipBuild || !existsSync('.next')) {
    console.log('\nnext build …');
    await run('npx', ['next', 'build'], { env: { ...process.env } });
  } else {
    assertBuildIsFresh();
  }

  // ---- server --------------------------------------------------------------
  const port = 3111 + (process.pid % 400);
  const base = `http://127.0.0.1:${port}`;
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    NEXT_PUBLIC_SUPABASE_URL: stubUrl,
    // Deliberately NOT shaped like `sb_secret_…`. The stub never checks the key,
    // so a realistic-looking literal bought nothing and tripped check:secrets,
    // which is right to flag a prefixed opaque key — it cannot know a literal is
    // fake. Keep these obviously non-credential.
    SUPABASE_SECRET_KEY: 'e2e-stub-key-unchecked-by-postgrest-stub',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-stub-publishable-unchecked',
    // REQUIRED now, not optional. The receipt audit hash is an HMAC and
    // `requireAuditSecret` refuses to mint without a secret — it used to fall
    // back to a constant printed in ComplianceReceipt.ts, which made every
    // audit hash forgeable by anyone holding the repo. An explicit test secret
    // here is the point: the e2e must not silently share whatever production
    // uses, and it must not re-enable the abandoned default (which is refused
    // by name).
    TRUSTRAILS_HMAC_SECRET: 'e2e-audit-hmac-secret-not-a-real-one',
    // Live /pay now fail-closes without contracted-evaluation seeds.
    // These are e2e-only identities, not production keys.
    TRUSTSHELL_DOER_SEED: bs58.encode(randomBytes(32)),
    TRUSTSHELL_AUDITOR_SEEDS: `${bs58.encode(randomBytes(32))},${bs58.encode(randomBytes(32))}`,
    TRUSTSHELL_MIN_AUDITOR_TIER: '0',
    // Left unset on purpose, and asserted below:
    //   AGENT_SOPHIA_SECRET_BYTES -> SolanaExecutor must report simulated
    //   BFT_ENFORCEMENT_MODE      -> observe mode, verdict NOT CHECKED
    NO_PROXY: `127.0.0.1,localhost,${process.env.NO_PROXY ?? ''}`,
    no_proxy: `127.0.0.1,localhost,${process.env.no_proxy ?? ''}`,
  };
  delete serverEnv.AGENT_SOPHIA_SECRET_BYTES;
  delete serverEnv.BFT_ENFORCEMENT_MODE;

  console.log(`\nnext start on ${base} …`);
  // detached puts the child in its OWN process group, so cleanup can signal the
  // whole tree. `npx next start` forks a separate `next-server` process; killing
  // the npx wrapper alone orphans it, and it keeps holding the port. The CI log
  // said so out loud — "Terminate orphan process: pid (2671) (next-server)" —
  // and locally it left a server per run. See the group kill in `finally`.
  server = spawn('npx', ['next', 'start', '-p', String(port)], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const serverLog = [];
  server.stdout.on('data', (d) => serverLog.push(String(d)));
  server.stderr.on('data', (d) => serverLog.push(String(d)));

  let version;
  try {
    version = await waitForServer(base);
    ledger.verified('server_boot', `commit=${version.commit_short ?? 'unknown'} platform=${version.platform ?? 'local'}`);
  } catch (err) {
    ledger.failed('server_boot', `${err.message}\n${serverLog.join('').slice(-2000)}`);
    throw err;
  }

  // ---- scenario 1: an agent with real evidence -----------------------------
  const torch = await postPay(base, {
    agentName: AGENTS.torch.payName,
    amountUSDC: 100,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: measured agent, within limits',
  });

  await ledger.check('pay_approved_with_measured_repid', () => {
    assert.equal(torch.status, 200, `expected 200, got ${torch.status}: ${JSON.stringify(torch.body).slice(0, 300)}`);
    assert.equal(torch.body.approved, true);
    assert.equal(torch.body.repid.resolvedAgent, AGENTS.torch.ledgerName,
      'payment-path name did not resolve into the reputation ledger namespace');
    assert.equal(torch.body.repid.fullyMeasured, true,
      `expected all four signals measured, got unmeasured=${JSON.stringify(torch.body.repid.unmeasured)}`);
    assert.ok(torch.body.repid.score > 0, 'measured agent scored 0');
    assert.equal(torch.body.contracted.invoked, true, 'approved payment skipped the contracted path');
    assert.equal(torch.body.contracted.outcome, 'VERIFIED');
    assert.notEqual(torch.body.contracted.checkerDid, torch.body.contracted.doerDid);
    return `score=${torch.body.repid.score} tier=${torch.body.repid.tier}`;
  });

  await ledger.check('repid_evidence_ships_with_score', () => {
    const d = torch.body.repid.detail;
    assert.ok(d, 'no evidence detail on the response');
    for (const signal of ['bftAccuracy', 'veritasCatchRate', 'x402SuccessRate', 'latencyMs']) {
      assert.ok(d[signal], `missing evidence for ${signal}`);
      assert.equal(d[signal].state, 'measured', `${signal} was ${d[signal].state}`);
      assert.ok(d[signal].observations > 0, `${signal} claims measured with 0 observations`);
    }
    return 'all four signals carry observation counts and reasons';
  });

  // ---- scenario 2: an agent with no evidence at all ------------------------
  const quiet = await postPay(base, {
    agentName: AGENTS.quiet.payName,
    amountUSDC: 100,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: zero evidence',
  });

  await ledger.check('unmeasured_scores_zero_not_default', () => {
    assert.equal(quiet.status, 200, `expected 200, got ${quiet.status}`);
    assert.equal(quiet.body.repid.unmeasured.length, 4,
      `expected all four signals unmeasured, got ${JSON.stringify(quiet.body.repid.unmeasured)}`);
    assert.equal(quiet.body.repid.fullyMeasured, false);
    // The specific regression: this agent's registry row says 3971. With no
    // evidence and no custody the computed score must be 0.
    assert.equal(quiet.body.repid.score, 0,
      `an agent with zero evidence scored ${quiet.body.repid.score}; a defaulted metric is back`);
    return 'zero evidence -> score 0, registry literal 3971 ignored';
  });

  await ledger.check('repid_differs_between_agents', () => {
    assert.notEqual(torch.body.repid.score, quiet.body.repid.score,
      'two agents with different histories scored identically — the four-literals bug is back');
    assert.ok(torch.body.repid.score > quiet.body.repid.score);
    assert.notEqual(torch.body.repid.score, 3971, 'the old hardcoded score reappeared');
    assert.notEqual(quiet.body.repid.score, 3971, 'the old hardcoded score reappeared');
    return `${torch.body.repid.score} vs ${quiet.body.repid.score}`;
  });

  // ---- scenario 3: the namespace split -------------------------------------
  const orphan = await postPay(base, {
    agentName: AGENTS.orphan.payName,
    amountUSDC: 100,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: not in the reputation ledger',
  });

  await ledger.check('unresolvable_agent_says_so', () => {
    assert.equal(orphan.status, 200);
    assert.equal(orphan.body.repid.resolvedAgent, null);
    assert.equal(orphan.body.repid.score, 0);
    const reason = orphan.body.repid.detail.bftAccuracy.reason;
    assert.match(reason, /no agent in repid_agents matches/i,
      `expected the reason to name the namespace miss, got: ${reason}`);
    return 'reports the miss instead of scoring on the registry literal';
  });

  // ---- honesty of the attestation -----------------------------------------
  await ledger.check('no_fabricated_proof_in_response', () => {
    const blob = JSON.stringify(torch.body);
    assert.ok(!/groth16/i.test(blob), 'groth16 appears in a live payment response');
    assert.ok(!/verificationKey/.test(blob), 'verificationKey is back on the wire');
    const att = torch.body.attestation;
    assert.equal(att.proven, false);
    assert.equal(att.proofSystem, 'none');
    assert.match(att.commitment, /^commit-sha256:[0-9a-f]{64}$/,
      `commitment is not a reopenable sha256 commitment: ${att.commitment}`);
    assert.ok(!att.commitment.startsWith('Qm'), 'commitment is shaped like an IPFS CID');
    return 'proven=false, proofSystem=none, commitment reopenable';
  });

  await ledger.check('unchecked_claim_is_absent_not_false', () => {
    const att = torch.body.attestation;
    assert.ok(!('entityNotSanctioned' in att.publicSignals),
      'entityNotSanctioned is asserted as a signal; false would claim the agent IS sanctioned');
    assert.ok(att.notAttested && 'entityNotSanctioned' in att.notAttested,
      'the unchecked sanctions claim is not declared in notAttested either — it just vanished');
    return 'sanctions claim declared unchecked rather than asserted';
  });

  await ledger.check('signals_are_derived_from_inputs', () => {
    // TORCH scores above the 5000 default threshold only if its evidence is
    // strong; whichever way it lands, the signal must agree with the score.
    const att = torch.body.attestation;
    const expected = torch.body.repid.score >= 5000;
    assert.equal(att.publicSignals.repidMeetsThreshold, expected,
      `repidMeetsThreshold=${att.publicSignals.repidMeetsThreshold} but score=${torch.body.repid.score}`);
    return `repidMeetsThreshold=${expected} consistent with score ${torch.body.repid.score}`;
  });

  // ---- settlement + consensus honesty --------------------------------------
  await ledger.check('settlement_reports_simulated', () => {
    const s = torch.body.settlement;
    assert.equal(s.simulated, true, 'claims a real settlement with no signing key configured');
    assert.equal(s.confirmed, false);
    assert.equal(s.status, 'simulated');
    assert.equal(torch.body.explorerUrl, null, 'fabricated an explorer URL for a transaction that never existed');
    assert.match(torch.body.message, /SIMULATED/, 'the human-readable message does not say it was simulated');
    return 'no key -> simulated, no txHash, no explorer URL';
  });

  await ledger.check('bft_reports_not_checked_in_observe_mode', () => {
    const b = torch.body.bft;
    assert.equal(b.mode, 'observe');
    assert.equal(b.evaluated, false);
    assert.equal(b.status, 'NOT CHECKED', `expected NOT CHECKED, got ${b.status}`);
    assert.equal(b.pending, true);
    assert.equal(b.resolvesVia, 'POST /api/trustrails/bft/process');
    return 'observe mode reports NOT CHECKED with a resolution path, not a pass';
  });

  // ---- gates ---------------------------------------------------------------
  const unknown = await postPay(base, {
    agentName: 'NOT_A_REGISTERED_AGENT',
    amountUSDC: 10,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: unknown agent',
  });
  await ledger.check('unknown_agent_denied', () => {
    assert.equal(unknown.status, 403);
    assert.equal(unknown.body.approved, false);
    assert.equal(unknown.body.stage, 'kya_validation');
    return unknown.body.reason;
  });

  const overLimit = await postPay(base, {
    agentName: 'TIGHT',
    amountUSDC: 5000,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: over per-tx limit',
  });
  await ledger.check('over_per_tx_limit_denied', () => {
    assert.equal(overLimit.status, 403);
    assert.equal(overLimit.body.stage, 'kya_validation');
    assert.match(overLimit.body.reason, /exceeds per-tx limit/i);
    return overLimit.body.reason;
  });

  // WHALE's per-tx limit is 200000, so these three genuinely reach the
  // signature gate instead of being denied at KYA validation first.
  const bigNoSigs = await postPay(base, {
    agentName: 'WHALE',
    amountUSDC: 60000,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: above single-signature threshold, unsigned',
  });
  await ledger.check('dual_signature_required_above_threshold', () => {
    assert.equal(bigNoSigs.body.stage, 'dual_signature_gate',
      `the signature gate was never reached — blocked at ${bigNoSigs.body.stage} instead`);
    assert.equal(bigNoSigs.status, 202);
    assert.equal(bigNoSigs.body.approved, false);
    assert.deepEqual(bigNoSigs.body.requiredSignatures, ['CFO', 'CTO']);
    return 'unsigned 60000 held at the signature gate (202), not settled';
  });

  const sameRole = await postPay(base, {
    agentName: 'WHALE',
    amountUSDC: 60000,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: two signatures, one role',
    signatures: [{ role: 'CFO' }, { role: 'CFO' }],
  });
  await ledger.check('same_role_dual_signature_rejected', () => {
    assert.equal(sameRole.body.stage, 'dual_signature_gate',
      `the signature gate was never reached — blocked at ${sameRole.body.stage} instead`);
    assert.equal(sameRole.status, 403, 'CFO+CFO was accepted as a dual signature');
    assert.equal(sameRole.body.approved, false);
    assert.match(sameRole.body.message, /distinct institutional roles/i);
    return 'CFO+CFO rejected as role-diverse signatures';
  });

  const distinctRoles = await postPay(base, {
    agentName: 'WHALE',
    amountUSDC: 60000,
    recipientAddress: RECIPIENT,
    purpose: 'e2e: two signatures, distinct roles',
    signatures: [{ role: 'CFO' }, { role: 'CTO' }],
  });
  await ledger.check('distinct_role_dual_signature_accepted', () => {
    // A gate that only ever closes is indistinguishable from a broken gate.
    assert.equal(distinctRoles.status, 200,
      `CFO+CTO did not pass the signature gate: ${JSON.stringify(distinctRoles.body).slice(0, 300)}`);
    assert.equal(distinctRoles.body.approved, true);
    return 'CFO+CTO opens the gate — it blocks on role diversity, not on signature count alone';
  });

  // ---- persistence ---------------------------------------------------------
  await ledger.check('receipt_persisted', () => {
    const receipts = stub.rowsOf('kya_compliance_receipts');
    assert.ok(receipts.length >= 1, 'no compliance receipt was written for an approved payment');
    const r = receipts[receipts.length - 1];
    assert.ok(r.agent_name, 'receipt has no agent_name');
    return `${receipts.length} receipt row(s) written`;
  });

  await ledger.check('bft_evaluation_enqueued', () => {
    const queued = stub.rowsOf('bft_payment_evaluations');
    assert.ok(queued.length >= 1,
      'observe mode reported "pending" but enqueued nothing — the verdict would never arrive');
    return `${queued.length} evaluation(s) queued`;
  });

  await ledger.check('no_unseeded_tables_touched', () => {
    assert.equal(stub.unseeded.size, 0,
      `route queried tables the fixture never seeded: ${[...stub.unseeded].join(', ')}. ` +
      'Either the seed is incomplete or a route is reading the wrong table.');
    return 'every table the routes touched was seeded';
  });

  // ---- dual-auth control proof, over real HTTP ----------------------------
  // The proofs below are minted by the SAME code a real holder would run, then
  // posted to the running server. Nothing about the identity path is stubbed.
  {
    const AUD = 'trinity:control-proof-verify';
    const identity = await loadIdentity();
    try {
      const { identity: idm, disclosure: disc, 'control-proof': cp, delegation: dlg,
              'harness-bundle': hb } = identity.mods;
      const postVerify = async (body) => {
        const res = await fetch(`${base}/api/trustshell/control-proof/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        return { status: res.status, json: await res.json() };
      };

      const human = await idm.createHumanSSID();
      const agent = await idm.createAgentIdentity('TORCH');

      await ledger.check('control_proof_verifies_over_http', async () => {
        const proof = await cp.issueControlProof({
          human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
        });
        const { status, json } = await postVerify({ proof, requiredCapabilities: ['pay:usdc'] });
        assert.equal(status, 200);
        assert.equal(json.valid, true, JSON.stringify(json.checks));
        assert.equal(json.checks.humanAuthorization.outcome, 'VERIFIED');
        assert.equal(json.checks.agentPossession.outcome, 'VERIFIED');
        return `human ${human.did.slice(0, 20)}… authorized agent, verified by the running server`;
      });

      await ledger.check('forged_control_proof_rejected_over_http', async () => {
        const impostor = await idm.createHumanSSID();
        const proof = await cp.issueControlProof({
          human: impostor, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
        });
        proof.grant.humanDid = human.did; // claim the real human authorized it
        const { status, json } = await postVerify({ proof });
        assert.equal(status, 200);
        assert.equal(json.valid, false, 'the server accepted a forged authorization');
        assert.equal(json.checks.humanAuthorization.outcome, 'FAILED');
        assert.deepEqual(json.grantedCapabilities, []);
        return 'impostor-signed grant rejected, no capabilities granted';
      });

      await ledger.check('wrong_audience_rejected_over_http', async () => {
        const proof = await cp.issueControlProof({
          human, agent, audience: 'trinity:vault', capabilities: ['pay:usdc'], ttlSeconds: 300,
        });
        const { json } = await postVerify({ proof });
        assert.equal(json.valid, false, 'a proof minted for another audience verified');
        assert.equal(json.checks.audience.outcome, 'FAILED');
        return 'proof bound to trinity:vault refused by trinity:control-proof-verify';
      });

      await ledger.check('replayed_control_proof_rejected_over_http', async () => {
        const proof = await cp.issueControlProof({
          human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
        });
        const first = await postVerify({ proof });
        assert.equal(first.json.valid, true, JSON.stringify(first.json.checks));
        const second = await postVerify({ proof });
        assert.equal(second.json.valid, false, 'the same proof verified twice');
        assert.equal(second.json.checks.replay.outcome, 'FAILED');
        return 'second presentation of the same nonce refused by the server';
      });

      await ledger.check('capability_escalation_rejected_over_http', async () => {
        const proof = await cp.issueControlProof({
          human, agent, audience: AUD, capabilities: ['read:memory'], ttlSeconds: 300,
        });
        const { json } = await postVerify({ proof, requiredCapabilities: ['pay:usdc'] });
        assert.equal(json.valid, false, 'an agent acted outside its granted capabilities');
        assert.equal(json.checks.capabilities.outcome, 'FAILED');
        return 'grant of read:memory refused for a pay:usdc requirement';
      });

      await ledger.check('selective_disclosure_survives_the_wire', async () => {
        const cred = await disc.buildCredential([
          { key: 'legalName', value: 'E2E Fixture Person' },
          { key: 'country', value: 'US' },
          { key: 'tier', value: 'Silver' },
        ]);
        const d = await disc.toDisclosure(cred, ['country']);
        const proof = await cp.issueControlProof({
          human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300, disclosure: d,
        });
        const { json } = await postVerify({ proof });
        assert.equal(json.valid, true, JSON.stringify(json.checks));
        assert.equal(json.checks.disclosure.outcome, 'VERIFIED');
        assert.deepEqual(json.disclosedClaims, { country: 'US' });
        const blob = JSON.stringify(json);
        assert.ok(!blob.includes('E2E Fixture Person'), 'a withheld claim came back from the server');
        assert.ok(!blob.includes('Silver'), 'a withheld claim came back from the server');
        return '1 of 3 claims disclosed and verified server-side; 2 withheld and absent from the response';
      });

      await ledger.check('delegated_subagent_verifies_over_http', async () => {
        const supervisor = await idm.createAgentIdentity('SUPERVISOR');
        const worker = await idm.createAgentIdentity('WORKER');
        const root = await cp.issueControlProof({
          human, agent: supervisor, audience: AUD,
          capabilities: ['pay:*', 'read:memory'], ttlSeconds: 300,
        });
        const link = await dlg.delegate({
          parent: root, delegator: supervisor, delegate: worker,
          capabilities: ['pay:usdc'], ttlSeconds: 120,
        });
        const { json } = await postVerify({ proof: link, requiredCapabilities: ['pay:usdc'] });
        assert.equal(json.valid, true, JSON.stringify(json));
        assert.equal(json.delegation.depth, 1);
        assert.deepEqual(json.grantedCapabilities, ['pay:usdc']);
        return 'supervisor delegated pay:usdc to a worker; chain verified server-side';
      });

      await ledger.check('subagent_cannot_widen_authority_over_http', async () => {
        // The forgery must be well-signed, or it fails on the signature and
        // never reaches the attenuation rule — the exact flaw that let three
        // mutations survive in the unit suite.
        const supervisor = await idm.createAgentIdentity('SUPERVISOR');
        const worker = await idm.createAgentIdentity('WORKER');
        const root = await cp.issueControlProof({
          human, agent: supervisor, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
        });
        const grant = {
          delegatorDid: supervisor.did, delegateDid: worker.did, delegateName: 'WORKER',
          capabilities: ['pay:*'],                      // wider than the parent
          audience: AUD, nonce: 'e2e-widen-000000000000',
          notBefore: root.grant.notBefore, expiresAt: root.grant.expiresAt,
        };
        const delegatorSignature = await idm.signAs(supervisor, dlg.delegationPayload(grant));
        const rogue = {
          parent: root, grant, delegatorSignature,
          delegateSignature: await idm.signAs(
            worker,
            `${dlg.DELEGATION_DOMAIN.countersign}|${dlg.delegationPayload(grant)}|${delegatorSignature}`
          ),
        };
        const { json } = await postVerify({ proof: rogue });
        assert.equal(json.valid, false, 'a well-signed widening verified server-side');
        assert.ok(json.delegation.links.some((l) => /widens authority/.test(l.detail)),
          JSON.stringify(json.delegation.links));
        assert.deepEqual(json.grantedCapabilities, []);
        return 'a well-signed link claiming pay:* under a pay:usdc parent was refused';
      });

      await ledger.check('subagent_cannot_outlive_its_parent_over_http', async () => {
        const supervisor = await idm.createAgentIdentity('SUPERVISOR');
        const worker = await idm.createAgentIdentity('WORKER');
        const root = await cp.issueControlProof({
          human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 60,
        });
        // Ask for a day; the parent has a minute. delegate() clamps.
        const link = await dlg.delegate({
          parent: root, delegator: supervisor, delegate: worker,
          capabilities: ['pay:usdc'], ttlSeconds: 86_400,
        });
        assert.ok(new Date(link.grant.expiresAt) <= new Date(root.grant.expiresAt),
          'child outlived parent after clamping');
        const { json } = await postVerify({ proof: link });
        assert.equal(json.valid, true, JSON.stringify(json));
        return `child clamped to parent expiry (${link.grant.expiresAt}), verified server-side`;
      });

      // ---- portable harness, presented to a host that did not issue it -----
      {
        const HOST = 'trinity:harness-host';
        const postHarness = async (body) => {
          const res = await fetch(`${base}/api/trustshell/harness/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
          });
          return { status: res.status, json: await res.json() };
        };
        const HASH = '0'.repeat(64);
        const packFor = async (audience, name = 'TORCH') => {
          const h = await idm.createHumanSSID();
          const a = await idm.createAgentIdentity(name);
          const authority = await cp.issueControlProof({
            human: h, agent: a, audience, capabilities: ['pay:usdc'], ttlSeconds: 300,
          });
          return hb.packHarness({
            agent: a, controllerDid: h.did, authority,
            skills: [{ name: 'trade', contentHash: `sha256:${HASH}` }],
            memory: { commitment: `commit-sha256:${HASH}`, itemCount: 42, takenAt: '2026-08-14T00:00:00Z' },
          });
        };

        await ledger.check('harness_bundle_verifies_over_http', async () => {
          const { status, json } = await postHarness({ bundle: await packFor(HOST) });
          assert.equal(status, 200);
          assert.equal(json.valid, true, JSON.stringify(json.parts));
          assert.equal(json.parts.integrity.outcome, 'VERIFIED');
          assert.equal(json.parts.authority.outcome, 'VERIFIED');
          return 'a host that issued nothing verified identity, authority, skills and memory ref';
        });

        await ledger.check('spliced_harness_rejected_over_http', async () => {
          // Both bundles genuine; the combination was never asserted by anyone.
          const a = await packFor(HOST, 'TORCH');
          const b = await packFor(HOST, 'NEXUS');
          const { json } = await postHarness({ bundle: { ...a, authority: b.authority } });
          assert.equal(json.valid, false, "one agent's authority rode inside another's bundle");
          assert.equal(json.parts.integrity.outcome, 'FAILED');
          assert.deepEqual(json.grantedCapabilities, []);
          return 'parts spliced from two valid bundles refused server-side';
        });

        await ledger.check('harness_is_not_a_bearer_token_over_http', async () => {
          // Minted for somewhere else: identity holds, authority does not.
          const { json } = await postHarness({ bundle: await packFor('trinity:elsewhere') });
          assert.equal(json.valid, false, 'a bundle minted elsewhere granted authority here');
          assert.equal(json.parts.integrity.outcome, 'VERIFIED', 'integrity should still hold');
          assert.equal(json.parts.authority.outcome, 'FAILED');
          assert.deepEqual(json.grantedCapabilities, []);
          return 'integrity VERIFIED, authority refused — identity without permission';
        });

        await ledger.check('harness_response_never_claims_skills_are_attested', async () => {
          const { json } = await postHarness({ bundle: await packFor(HOST) });
          assert.match(json.skillNote, /not an attestation/i);
          assert.match(json.parts.skills.detail, /NOT an attestation/);
          return 'the host is told to compare hashes against what it loads';
        });
      }

      await ledger.check('malformed_proof_is_a_400_not_a_forgery', async () => {
        const { status } = await postVerify({ proof: { grant: {} } });
        assert.equal(status, 400, 'a malformed request was processed as a verification');
        return 'shape errors answer 400, so they cannot be misread as a failed signature';
      });
    } finally {
      identity.dispose();
    }
  }

  // ---- what this run did NOT check ----------------------------------------
  ledger.notChecked('solana_broadcast',
    'AGENT_SOPHIA_SECRET_BYTES unset and Solana devnet is not reachable from a sandboxed ' +
    'session; the settlement path was exercised only in its simulated branch');
  ledger.notChecked('live_supabase_schema',
    'the sandbox proxy denies qnnpjhlxljtqyigedwkb.supabase.co, so these assertions ran ' +
    'against scripts/e2e/postgrest-stub.mjs. Column drift in the real schema would not be caught here');
  ledger.notChecked('control_proof_replay_across_instances',
    'the verify route holds spent nonces in process memory, so replay was proven caught within ' +
    'ONE instance only. Cross-instance defence needs migration 20260814090000_control_proof_nonces.sql, ' +
    'which is deliberately unapplied pending Sean');
  ledger.notChecked('bft_consensus_verdict',
    'observe mode is the default; the panel itself runs only under BFT_ENFORCEMENT_MODE=enforce ' +
    'with live LLM providers');

} catch (err) {
  if (!ledger.entries.size || ![...ledger.entries.values()].some((e) => e.outcome === 'FAILED')) {
    ledger.failed('run_aborted', err?.message ?? String(err));
  }
} finally {
  if (server?.pid) {
    // Negative pid signals the whole process group — the npx wrapper AND the
    // next-server it forked. `server.kill()` reaches only the wrapper.
    const killGroup = (signal) => {
      try { process.kill(-server.pid, signal); } catch { /* already gone */ }
    };
    killGroup('SIGTERM');
    // Wait for it to actually die rather than assuming SIGTERM landed.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try { process.kill(-server.pid, 0); } catch { break; }
      if (i === 19) killGroup('SIGKILL');
    }
    // Say so if the port is still held; a leaked server breaks the NEXT run,
    // which would otherwise look like an unrelated failure.
    try {
      process.kill(-server.pid, 0);
      console.warn(`WARNING: server process group ${server.pid} survived SIGKILL; port may still be held`);
    } catch { /* gone, as intended */ }
  }
  if (stub) await stub.close();
}

console.log('\nE2E verification ledger\n');
const ok = ledger.report();
console.log('');
process.exit(ok ? 0 : 1);
