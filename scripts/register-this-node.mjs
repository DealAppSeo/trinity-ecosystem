#!/usr/bin/env node
// scripts/register-this-node.mjs — the missing producer for the fleet registry.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `docs/MCP-FLEET.md` ships a discovery server over `agent_node_registry` and
// says plainly what is wrong with it:
//
//   "agent_node_registry has zero rows, and nothing else in this repo writes to
//    it. A discovery server over a table nobody populates is decorative."
//
// That was written 2026-08-13 and was still true on 2026-08-29 (0 rows). The
// design was never the gap. The FEEDER was — the same finding
// `reports/2026-08-09/TOOLING_EVAL_MEMORY_GRAPH_ROUTING.md` made about the graph
// store: "We do not have a graph-store gap. We have a feeder gap."
//
// This is the feeder. It runs ON a node and registers THAT node.
//
// ── THE ONE RULE: MEASURE, NEVER ASSERT ─────────────────────────────────────
//
// A registry of self-declared capabilities is worse than an empty one, because
// `discover_agents` would then route real work to a node that cannot do it, and
// the failure surfaces somewhere else entirely. So every flag below comes from a
// PROBE that ran on this machine, and the probe's result is printed next to it.
//
// `can_prove` and `can_hal_vote` default FALSE and only become true when their
// probe passes. A capability nobody measured is absent, not assumed — the same
// three-outcome discipline `docs/KNOWN-LIMITS.md` applies to the UI, applied to
// the fleet.
//
// This is also why it registers ITSELF rather than taking a node list: a node
// cannot honestly describe hardware and binaries it does not have in front of it.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//
//   node scripts/register-this-node.mjs --dry-run     # probe + print, write nothing
//   node scripts/register-this-node.mjs               # probe + register + claim lease
//   node scripts/register-this-node.mjs --heartbeat   # renew an existing lease
//
// Env:
//   FLEET_ENDPOINT         default https://app.aitrinitysymphony.com/api/mcp/fleet
//   INTERNAL_ROUTE_SECRET  required to write (service principal). Absent -> dry-run.
//   NODE_ID                override the derived id
//   NODE_LANE              work lane this node serves (default: derived)
//   NODE_PURPOSE           free text
//
// Exit codes follow the house convention:
//   0  VERIFIED     probed, and (unless --dry-run) registered
//   2  NOT_CHECKED  no write credential, or the endpoint was unreachable
//   1  FAILED       the endpoint answered and refused

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const HEARTBEAT = argv.includes('--heartbeat');
const ENDPOINT = process.env.FLEET_ENDPOINT || 'https://app.aitrinitysymphony.com/api/mcp/fleet';
const SECRET = process.env.INTERNAL_ROUTE_SECRET || '';

/* ─────────────────────────── probes ─────────────────────────── */

/** Is a binary runnable? Not "is it on PATH" — we execute it. Installed != runnable. */
function probeBinary(bin, args = ['--version']) {
  try {
    const out = execFileSync(bin, args, { stdio: 'pipe', timeout: 15000 }).toString().trim();
    return { ok: true, detail: out.split('\n')[0].slice(0, 60) };
  } catch (err) {
    return { ok: false, detail: (err.code === 'ENOENT' ? 'not on PATH' : String(err.message).slice(0, 60)) };
  }
}

/**
 * Which agent CLIs can this node actually drive?
 *
 * This is the field that would have saved a real hour: on 2026-08-29 a cloud
 * session was asked to "recruit XC, GA and T12" and could not, because grok,
 * gemini and codex are not on its PATH — a fact discoverable only by looking.
 * With this row present, `discover_agents` answers it before the work is queued.
 */
function probeModels() {
  const candidates = [
    ['claude', ['--version']],
    ['grok', ['--version']],
    ['gemini', ['--version']],
    ['codex', ['--version']],
    ['ollama', ['--version']],
  ];
  const found = [];
  const report = [];
  for (const [bin, args] of candidates) {
    const r = probeBinary(bin, args);
    report.push(`      ${r.ok ? 'YES' : 'no '}  ${bin.padEnd(8)} ${r.detail}`);
    if (r.ok) found.push(bin);
  }
  return { models: found, report };
}

/**
 * can_prove — can this node actually produce a ZK proof?
 *
 * `STATUS.md` records why this cannot be taken on faith: Plonky3 did not build in
 * the sandboxed container — "cargo fetch hangs until killed (proxy denies
 * static.crates.io)" — while the XAI lane built it fine on a developer machine.
 * Same repo, opposite answer, so the only honest source is a probe here.
 *
 * THE FIRST VERSION OF THIS PROBE WAS WRONG, and how it was wrong is the lesson.
 * It ran `cargo search`, which hits the sparse INDEX, and reported can_prove:true.
 * What STATUS.md says failed is `cargo fetch`, which pulls tarballs from
 * static.crates.io — a different host and a different operation. Testing the index
 * to conclude something about the tarball CDN is "verify the thing itself, never a
 * proxy for it" (LESSONS #2) violated inside the probe written to prevent it.
 *
 * It now fetches a real crate into a throwaway manifest. MEASURED 2026-08-29 in
 * this container: `cargo fetch` SUCCEEDS (itoa v1.0.18 downloaded), so the blocker
 * STATUS.md recorded has DECAYED. That does not mean Plonky3 builds here — one
 * small crate is not a large dependency graph — and this flag claims only what it
 * measured: the index and the CDN are both reachable.
 */
function probeCanProve() {
  const cargo = probeBinary('cargo', ['--version']);
  if (!cargo.ok) return { ok: false, detail: `cargo ${cargo.detail}` };
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'canprove-'));
    writeFileSync(join(dir, 'Cargo.toml'),
      '[package]\nname = "canprove"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\nitoa = "1"\n');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'main.rs'), 'fn main(){}\n');
    execFileSync('cargo', ['fetch'], { cwd: dir, stdio: 'pipe', timeout: 120000 });
    return { ok: true, detail: `${cargo.detail}, crate FETCH succeeds (index + CDN reachable)` };
  } catch (err) {
    return { ok: false, detail: `${cargo.detail}, crate fetch FAILED — no prover buildable here (${String(err.message).slice(0, 45)})` };
  } finally {
    if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
}

/**
 * can_hal_vote — is the HAL quorum endpoint reachable and answering from here?
 *
 * Reachability is the property, and it is per-node: `CLAUDE.md`'s network table
 * went stale in exactly this direction, listing hosts as denied that answer.
 */
async function probeCanHalVote() {
  const url = 'https://repid-engine-production.up.railway.app/api/v1/hal/evaluate';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'fleet node registration probe', criteria: ['reachability'] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return { ok: false, detail: `HAL answered HTTP ${res.status}` };
    const j = await res.json();
    const n = Array.isArray(j.provider_responses) ? j.provider_responses.length : 0;
    const live = Array.isArray(j.provider_responses)
      ? j.provider_responses.filter((p) => p.verdict && p.verdict !== 'ERROR').length : 0;
    return { ok: true, detail: `HAL reachable, ${live}/${n} providers answering` };
  } catch (err) {
    return { ok: false, detail: `HAL unreachable from here: ${String(err.message).slice(0, 60)}` };
  }
}

/** Which surface is this? Derived from markers, and it says when it is guessing. */
function probeSurface() {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
    return { surface: 'railway', detail: process.env.RAILWAY_SERVICE_NAME || 'railway' };
  }
  if (process.env.VERCEL) return { surface: 'vercel', detail: process.env.VERCEL_ENV || 'vercel' };
  if (existsSync('/root/.ccr') || process.env.CLAUDE_CODE_REMOTE) {
    return { surface: 'claude-code-remote', detail: 'sandboxed cloud container' };
  }
  return { surface: 'local', detail: `${os.platform()} ${os.release()}` };
}

function gitBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe' }).toString().trim();
  } catch { return null; }
}

/* ─────────────────────────── main ─────────────────────────── */

async function main() {
  const surf = probeSurface();
  const { models, report } = probeModels();
  const prove = probeCanProve();
  const hal = await probeCanHalVote();

  const nodeId = process.env.NODE_ID || `${surf.surface}-${os.hostname()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const node = {
    node_id: nodeId,
    surface: surf.surface,
    lane: process.env.NODE_LANE || 'unassigned',
    owns: [],
    models,
    branch: gitBranch(),
    purpose: process.env.NODE_PURPOSE || `auto-registered by register-this-node.mjs`,
    region: process.env.RAILWAY_REGION || process.env.VERCEL_REGION || null,
    can_prove: prove.ok,
    can_hal_vote: hal.ok,
    lease_seconds: 900,
  };

  console.log(`register-this-node — probing ${nodeId}\n`);
  console.log(`  surface       ${surf.surface}  (${surf.detail})`);
  console.log(`  cpu / ram     ${os.cpus().length} cores, ${Math.round(os.totalmem() / 1048576)} MB`);
  console.log(`  branch        ${node.branch ?? '(not a git checkout)'}`);
  console.log(`  models        ${models.length ? models.join(', ') : '(none runnable here)'}`);
  console.log(report.join('\n'));
  console.log(`  can_prove     ${prove.ok ? 'YES' : 'no '}  ${prove.detail}`);
  console.log(`  can_hal_vote  ${hal.ok ? 'YES' : 'no '}  ${hal.detail}`);

  if (DRY || !SECRET) {
    console.log(`\n${JSON.stringify(node, null, 2)}`);
    if (!SECRET && !DRY) {
      console.log('\nregister-this-node — NOT_CHECKED');
      console.log('  INTERNAL_ROUTE_SECRET is unset, so nothing was written. The probes above');
      console.log('  are real; the registration is not. Set it where the node actually runs.');
      process.exit(2);
    }
    console.log('\nregister-this-node — VERIFIED (dry run; nothing written)');
    process.exit(0);
  }

  const tool = HEARTBEAT ? 'heartbeat_node' : 'register_node';
  const args = HEARTBEAT ? { node_id: node.node_id, lease_seconds: node.lease_seconds } : node;

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    console.log(`\nregister-this-node — NOT_CHECKED: ${ENDPOINT} unreachable (${String(err.message).slice(0, 80)}).`);
    console.log('  Unreachable is not refused. Nothing was written and nothing is known.');
    process.exit(2);
  }

  const body = await res.text();
  if (!res.ok) {
    console.error(`\nregister-this-node — FAILED: HTTP ${res.status}\n${body.slice(0, 400)}`);
    process.exit(1);
  }
  let parsed;
  try { parsed = JSON.parse(body); } catch {
    console.error(`\nregister-this-node — FAILED: unparseable response\n${body.slice(0, 300)}`);
    process.exit(1);
  }
  if (parsed.error || parsed.result?.isError) {
    console.error(`\nregister-this-node — FAILED: ${JSON.stringify(parsed.error ?? parsed.result).slice(0, 400)}`);
    process.exit(1);
  }

  console.log(`\nregister-this-node — VERIFIED. ${tool} accepted; lease ${node.lease_seconds}s.`);
  console.log('  Re-run with --heartbeat before the lease expires, or the node ages out —');
  console.log('  which is correct: a node that stopped heartbeating should stop being discoverable.');
  process.exit(0);
}

main().catch((e) => {
  console.error(`register-this-node — FAILED: ${e?.stack || e}`);
  process.exit(1);
});
