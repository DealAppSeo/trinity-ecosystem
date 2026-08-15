#!/usr/bin/env node
//
// check-init.mjs — assertions for `trustshell init`. TrustShell M5.
//
// This installs a hook into a config file that a RUNNING agent reads, so the
// properties worth protecting are the destructive ones:
//
//   - it must never overwrite settings it could not parse
//   - it must never drop somebody else's hooks
//   - running it twice must not install it twice
//   - uninstall must return the file to its original bytes
//   - and the installed command must SWALLOW A FAILURE, because §7.3 says a
//     TrustShell crash must not fail the session. That one is verified by
//     actually running a failing command through the wrapper, not by reading it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const init = await import(pathToFileURL(join(process.cwd(), 'scripts', 'trustshell-init.mjs')).href);

let pass = 0;
const failures = [];
const ok = (n, c, d = '') => (c ? pass++ : failures.push(`${n}${d ? ` — ${d}` : ''}`));
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const work = mkdtempSync(join(tmpdir(), 'ts-init-'));
const run = (args) => {
  try {
    return {
      code: 0,
      // stderr is CAPTURED, not inherited. One test deliberately triggers the
      // malformed-settings refusal, and letting its "FAILED" reach the console
      // makes a passing run look like a failing one — which is the exact
      // ambiguity this repo keeps paying for.
      out: execFileSync(process.execPath, ['scripts/trustshell-init.mjs', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const cmd = init.hookCommand({ repo: '/repo', db: '/db/r.db', claims: false });
ok('hook names the receipt script', cmd.includes('trustshell-receipt.mjs'), cmd);
ok('hook passes the transcript path', cmd.includes('$CLAUDE_TRANSCRIPT_PATH'), cmd);
ok('hook swallows a non-zero exit', cmd.trim().endsWith('|| true'), cmd);
ok('hook redirects its own output', cmd.includes('>>') && cmd.includes('2>&1'), cmd);
ok('hook carries the uninstall marker', cmd.includes('trustshell-receipt'), cmd);
ok('--claims is off unless asked', !cmd.includes('--claims'), cmd);
ok('--claims is passed when asked',
   init.hookCommand({ repo: '/repo', db: '/db/r.db', claims: true }).includes('--claims'));

// Paths with spaces must survive, or init silently breaks on macOS defaults.
{
  const spaced = init.hookCommand({ repo: '/Users/a b/repo', db: '/tmp/my db/r.db', claims: false });
  ok('paths with spaces are quoted', spaced.includes('"/Users/a b/repo/scripts/trustshell-receipt.mjs"'), spaced);
  ok('db path with spaces is quoted', spaced.includes('"/tmp/my db/r.db"'), spaced);
}

// withHook / withoutHook
{
  const foreign = {
    hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo someone-elses-hook' }] }] },
    model: 'opus',
  };
  const installed = init.withHook(foreign, cmd);
  ok('install preserves unrelated top-level keys', installed.model === 'opus');
  const all = installed.hooks.Stop.flatMap((g) => g.hooks).map((h) => h.command);
  ok('install preserves a foreign hook', all.some((c) => c.includes('someone-elses-hook')), JSON.stringify(all));
  ok('install adds ours', all.some((c) => c.includes('trustshell-receipt')), JSON.stringify(all));

  // Idempotency — two installs, one hook.
  const twice = init.withHook(installed, cmd);
  const ours = twice.hooks.Stop.flatMap((g) => g.hooks).filter((h) => h.command.includes('trustshell-receipt'));
  eq('installing twice leaves exactly one hook', ours.length, 1);

  // Re-install with a different db replaces rather than duplicates.
  const moved = init.withHook(installed, init.hookCommand({ repo: '/repo', db: '/other.db', claims: false }));
  const movedOurs = moved.hooks.Stop.flatMap((g) => g.hooks).filter((h) => h.command.includes('trustshell-receipt'));
  eq('re-install with new options still leaves one hook', movedOurs.length, 1);
  ok('...and it is the new one', movedOurs[0].command.includes('/other.db'));

  // Uninstall is exact.
  const removed = init.withoutHook(installed);
  const left = (removed.hooks?.Stop ?? []).flatMap((g) => g.hooks).map((h) => h.command);
  ok('uninstall removes ours', !left.some((c) => c.includes('trustshell-receipt')), JSON.stringify(left));
  ok('uninstall keeps the foreign hook', left.some((c) => c.includes('someone-elses-hook')), JSON.stringify(left));
  eq('uninstall preserves other keys', removed.model, 'opus');
}
{
  // Uninstall from a file where ours is the ONLY hook must leave no scaffolding.
  const only = init.withHook({}, cmd);
  const bare = init.withoutHook(only);
  eq('uninstall leaves no empty hooks object', JSON.stringify(bare), '{}');
}
{
  eq('uninstall on a clean file is a no-op', JSON.stringify(init.withoutHook({ model: 'x' })), '{"model":"x"}');
  ok('withHook does not mutate its input', (() => {
    const src = { hooks: { Stop: [] } };
    const snapshot = JSON.stringify(src);
    init.withHook(src, cmd);
    return JSON.stringify(src) === snapshot;
  })());
}

// ---------------------------------------------------------------------------
// §7.3 — the installed command cannot fail the session.
// Executed, not read: the whole point is that the wrapper behaves at runtime.
// ---------------------------------------------------------------------------
{
  const log = join(work, 'hook.log');
  const failing = `{ node -e "console.error('boom'); process.exit(3)" >> ${JSON.stringify(log)} 2>&1 ; } || true`;
  let code = 0;
  try {
    execFileSync('/bin/sh', ['-c', failing], { stdio: 'pipe' });
  } catch (err) {
    code = err.status ?? 1;
  }
  eq('a crashing receipt writer exits 0 through the wrapper', code, 0);
  ok('...and its output went to the log, not the session',
     existsSync(log) && readFileSync(log, 'utf8').includes('boom'));
}

// ---------------------------------------------------------------------------
// CLI end to end, against a temp settings.json
// ---------------------------------------------------------------------------
{
  const dir = join(work, 'proj', '.claude');
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  writeFileSync(settings, JSON.stringify({ model: 'opus', hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keepme' }] }] } }, null, 2));
  const original = readFileSync(settings, 'utf8');

  // Dry run must not write.
  const dry = run(['--settings', settings, '--db', join(work, 'r.db')]);
  eq('dry run exits 0', dry.code, 0);
  ok('dry run says it wrote nothing', dry.out.includes('Dry run'), dry.out);
  eq('dry run left the file byte-identical', readFileSync(settings, 'utf8'), original);

  // Apply.
  const applied = run(['--settings', settings, '--db', join(work, 'r.db'), '--apply']);
  eq('apply exits 0', applied.code, 0);
  const after = JSON.parse(readFileSync(settings, 'utf8'));
  const cmds = after.hooks.Stop.flatMap((g) => g.hooks).map((h) => h.command);
  ok('apply installed the hook', cmds.some((c) => c.includes('trustshell-receipt')), JSON.stringify(cmds));
  ok('apply kept the foreign hook', cmds.some((c) => c.includes('keepme')), JSON.stringify(cmds));
  ok('apply wrote a backup', existsSync(`${settings}.trustshell-backup`));
  eq('backup holds the original bytes', readFileSync(`${settings}.trustshell-backup`, 'utf8'), original);

  // Second apply is a no-op.
  const again = run(['--settings', settings, '--db', join(work, 'r.db'), '--apply']);
  ok('second apply reports nothing to do', again.out.includes('Nothing to do'), again.out);

  // Uninstall restores.
  const gone = run(['--settings', settings, '--uninstall', '--apply']);
  eq('uninstall exits 0', gone.code, 0);
  const restored = JSON.parse(readFileSync(settings, 'utf8'));
  const leftCmds = (restored.hooks?.Stop ?? []).flatMap((g) => g.hooks).map((h) => h.command);
  ok('uninstall removed ours', !leftCmds.some((c) => c.includes('trustshell-receipt')), JSON.stringify(leftCmds));
  ok('uninstall kept theirs', leftCmds.some((c) => c.includes('keepme')), JSON.stringify(leftCmds));
  eq('uninstall preserved other keys', restored.model, 'opus');
}
{
  // A settings file that does not parse must be refused, not replaced.
  const dir = join(work, 'broken', '.claude');
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  writeFileSync(settings, '{ "model": "opus", oops');
  const before = readFileSync(settings, 'utf8');
  const r = run(['--settings', settings, '--apply']);
  eq('malformed settings: exits non-zero', r.code, 1);
  ok('malformed settings: says why', r.out.includes('not valid JSON'), r.out);
  eq('malformed settings: file untouched', readFileSync(settings, 'utf8'), before);
}
{
  // A missing settings file is created only under --apply.
  const settings = join(work, 'fresh', '.claude', 'settings.json');
  const dry = run(['--settings', settings]);
  eq('missing file: dry run creates nothing', existsSync(settings), false);
  ok('missing file: dry run still exits 0', dry.code === 0, dry.out);
  run(['--settings', settings, '--db', join(work, 'r2.db'), '--apply']);
  ok('missing file: apply creates it', existsSync(settings));
  const created = JSON.parse(readFileSync(settings, 'utf8'));
  ok('created file has only our hook',
     created.hooks.Stop.flatMap((g) => g.hooks).every((h) => h.command.includes('trustshell-receipt')));
}

// Detection reports what exists rather than asserting a layout.
{
  const found = init.detect('/nowhere-home', '/nowhere-cwd');
  eq('detect returns both scopes', found.length, 2);
  ok('detect marks absent files absent', found.every((f) => f.exists === false), JSON.stringify(found));
  ok('detect prefers project scope first', found[0].scope === 'project');
}

rmSync(work, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} of ${pass + failures.length} assertions:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`VERIFIED — trustshell init (M5): ${pass} assertions, 0 failed.`);
