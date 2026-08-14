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
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createPostgrestStub } from './postgrest-stub.mjs';
import { VerificationLedger } from './ledger.mjs';
import { buildSeed, AGENTS } from './seed.mjs';

const argv = new Set(process.argv.slice(2));
const strict = argv.has('--strict') || process.env.E2E_STRICT === '1';
const skipBuild = argv.has('--no-build');

const CORE_STEPS = [
  'server_boot',
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

  // ---- what this run did NOT check ----------------------------------------
  ledger.notChecked('solana_broadcast',
    'AGENT_SOPHIA_SECRET_BYTES unset and Solana devnet is not reachable from a sandboxed ' +
    'session; the settlement path was exercised only in its simulated branch');
  ledger.notChecked('live_supabase_schema',
    'the sandbox proxy denies qnnpjhlxljtqyigedwkb.supabase.co, so these assertions ran ' +
    'against scripts/e2e/postgrest-stub.mjs. Column drift in the real schema would not be caught here');
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
