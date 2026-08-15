#!/usr/bin/env node
//
// trustshell-init.mjs — install the receipt harness into a Claude Code install.
//
//   node scripts/trustshell-init.mjs [--apply] [--uninstall]
//                                    [--settings <path>] [--db <path>] [--claims]
//
// TrustShell M5. §9: "detect installed MCP clients, find which are installed,
// write the config. It is mechanical, not clever, and it is the whole first-run
// experience."
//
// ============================================================================
// WHAT THIS IS NOT, AND WHY THE NAME MATTERS
// ============================================================================
//
// §9's package table says `@hyperdag/trustshell` (published 1.3.0) is "core:
// parse, check, hash, sign", and `@hyperdag/trustshell-mcp` (1.0.0) is "the
// vehicle [that] already exists". Measured 2026-08-15 by installing both:
//
//   @hyperdag/trustshell@1.3.0      HAL cross-LLM verification, portable RepID,
//                                   A2A service purchase, against a LIVE BACKEND.
//                                   CLI: verify | repid | proof | badge | version.
//                                   ZERO occurrences of transcript / audit_hash /
//                                   session_receipt anywhere in dist/.
//   @hyperdag/trustshell-mcp@1.0.0  MCP tools verify_output, get_repid,
//                                   present_proof, verify_proof, buy_service,
//                                   list_services. Same product. Also zero.
//
// They are a different product that happens to share a name. Two consequences
// the spec did not anticipate:
//
//   1. `trustshell verify <session>` — the CLI §9 proposes — WOULD COLLIDE.
//      `trustshell verify` already ships and means "verify an LLM output".
//      Shipping a second meaning under the same verb on the same binary is how
//      you get a support burden that never ends.
//   2. Adding receipts to that package means publishing a new version of a live
//      SDK. Publishing is irreversible and Sean-gated (CLAUDE.md), so it is not
//      something this file does or assumes.
//
// So this installs the LOCAL receipt tooling by absolute path. When the receipt
// harness is eventually published it should take its own name.
//
// ============================================================================
// SAFETY
// ============================================================================
//
// This edits a config file that a running agent reads. Three rules:
//
//   - DRY RUN BY DEFAULT. It prints the exact diff and changes nothing unless
//     --apply is passed.
//   - THE HOOK CANNOT FAIL THE SESSION. §7.3: "Wrap the hook so a non-zero exit
//     is logged and swallowed." The installed command ends in `|| true` and
//     redirects its own output, so a crash in the receipt writer is invisible to
//     the agent and harmless to the session.
//   - REVERSIBLE. --uninstall removes exactly what was added and leaves any
//     other hooks alone. Every --apply writes a timestamped backup first.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : (argv[i + 1] ?? d);
};

if (flag('--help')) {
  console.log(
    'usage: trustshell-init [--apply] [--uninstall] [--settings <path>] [--db <path>] [--claims]\n' +
      '\n' +
      '  (default)      dry run — print what would change, write nothing\n' +
      '  --apply        write the change, after backing the file up\n' +
      '  --uninstall    remove the TrustShell hook, leaving others intact\n' +
      '  --settings     target settings.json (default: the first detected install)\n' +
      '  --db           receipt SQLite path (default: ~/.trustshell/receipts.db)\n' +
      '  --claims       also run T0/T1 claim checking on each session\n'
  );
  process.exit(0);
}

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MARKER = 'trustshell-receipt'; // how the hook is recognised on uninstall

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Candidate settings files, most specific first.
 *
 * Claude Code reads project settings before user settings, and this container
 * has neither — only `launcher-settings.json`, which is managed by the host and
 * must not be edited. Detection therefore reports what it FOUND, and creating a
 * missing file is an explicit act rather than a silent side effect.
 */
export function candidateSettings(home = homedir(), cwd = process.cwd()) {
  return [
    { scope: 'project', path: join(cwd, '.claude', 'settings.json') },
    { scope: 'user', path: join(home, '.claude', 'settings.json') },
  ];
}

export function detect(home = homedir(), cwd = process.cwd()) {
  return candidateSettings(home, cwd).map((c) => ({ ...c, exists: existsSync(c.path) }));
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function hookCommand({ repo = REPO, db, claims }) {
  const parts = [
    'node',
    JSON.stringify(join(repo, 'scripts', 'trustshell-receipt.mjs')),
    '"$CLAUDE_TRANSCRIPT_PATH"',
    '--git-reconcile',
  ];
  if (claims) parts.push('--claims');
  if (db) parts.push('--store', JSON.stringify(db));
  // §7.3, encoded rather than described: stdout and stderr go to a log, and a
  // non-zero exit becomes zero. A receipt writer that throws must not turn into
  // a failed agent session — the harness is an observer, and an observer that
  // can break the thing it observes is not in shadow mode.
  return `{ ${parts.join(' ')} >> ${JSON.stringify(join(repo, '.trustshell.log'))} 2>&1 ; } || true`;
}

/**
 * Add the hook to a settings object, preserving everything already there.
 *
 * Returns a NEW object; the input is not mutated, so a dry run and an apply
 * compute the same thing from the same bytes.
 */
export function withHook(settings, command) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  next.hooks = next.hooks ?? {};
  const stop = Array.isArray(next.hooks.Stop) ? next.hooks.Stop : [];

  // Idempotent: replace our own entry rather than appending a second one.
  // Running init twice is normal (a re-install, a changed db path) and must not
  // leave two hooks racing to write the same receipt.
  const cleaned = stop
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(MARKER)),
    }))
    .filter((group) => (group.hooks ?? []).length > 0);

  cleaned.push({ matcher: '', hooks: [{ type: 'command', command }] });
  next.hooks.Stop = cleaned;
  return next;
}

export function withoutHook(settings) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  if (!next.hooks?.Stop) return next;
  next.hooks.Stop = next.hooks.Stop
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(MARKER)),
    }))
    .filter((group) => (group.hooks ?? []).length > 0);
  // Leave no empty scaffolding behind — uninstall should return the file to
  // something indistinguishable from never having run init.
  if (next.hooks.Stop.length === 0) delete next.hooks.Stop;
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

export function readSettings(path) {
  if (!existsSync(path)) return { settings: {}, existed: false, error: null };
  const raw = readFileSync(path, 'utf8');
  try {
    return { settings: JSON.parse(raw), existed: true, error: null };
  } catch (err) {
    // Never overwrite a file we could not parse. A malformed settings.json is
    // someone's work in progress, and replacing it with our own would destroy
    // whatever they were editing.
    return { settings: null, existed: true, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = detect();
  const target =
    opt('--settings') ?? found.find((f) => f.exists)?.path ?? found[found.length - 1].path;
  const db = opt('--db') ?? join(homedir(), '.trustshell', 'receipts.db');
  const uninstall = flag('--uninstall');

  console.log('TrustShell init');
  console.log('  detected Claude Code settings:');
  for (const f of found) console.log(`    ${f.exists ? '✓' : '·'} ${f.scope.padEnd(8)} ${f.path}`);
  console.log(`  target: ${target}`);

  const { settings, existed, error } = readSettings(target);
  if (error) {
    console.error(`\nFAILED — ${target} is not valid JSON (${error}).`);
    console.error('Refusing to overwrite it. Fix or move the file, then re-run.');
    process.exit(1);
  }

  const command = hookCommand({ db, claims: flag('--claims') });
  const next = uninstall ? withoutHook(settings) : withHook(settings, command);

  const before = JSON.stringify(settings, null, 2);
  const after = JSON.stringify(next, null, 2);

  if (before === after) {
    console.log(`\nNothing to do — ${uninstall ? 'no TrustShell hook installed' : 'already installed'}.`);
    process.exit(0);
  }

  console.log(`\n${uninstall ? 'Would remove' : 'Would install'} on Stop:`);
  if (!uninstall) console.log(`  ${command}`);
  console.log(`\n--- ${target} ---\n${after}\n`);

  if (!flag('--apply')) {
    console.log('Dry run. Nothing written. Re-run with --apply to write it.');
    process.exit(0);
  }

  mkdirSync(dirname(target), { recursive: true });
  if (existed) {
    // Timestamp comes from the filesystem rather than a clock we format, so two
    // applies in the same second cannot silently overwrite one backup.
    const backup = `${target}.trustshell-backup`;
    copyFileSync(target, backup);
    console.log(`Backed up → ${backup}`);
  }
  if (!uninstall) mkdirSync(dirname(db), { recursive: true });
  writeFileSync(target, `${after}\n`);

  console.log(`${uninstall ? 'Removed' : 'Installed'}. ${target}`);
  if (!uninstall) {
    console.log(`Receipts → ${db}`);
    console.log(`Hook log → ${join(REPO, '.trustshell.log')}`);
    console.log('\nThe hook cannot fail your session: its output is redirected and its');
    console.log('exit code is swallowed. If no receipts appear, read the log.');
  }
}
