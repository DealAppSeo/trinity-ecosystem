#!/usr/bin/env node
//
// check-trust-foundation.mjs — the Software Trust Foundation, enforced.
//
//   npm run check:trust
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
//
// It is not a statement of security posture. A document asserting controls
// nobody has measured is the house defect of this codebase in its purest form —
// a system reporting success it has not earned — and a "best practices" file is
// the easiest such document in the world to write. Every control below is
// therefore MECHANICAL: it reads the tree and fails the build. If a control
// cannot be checked from here, it says NOT ENFORCEABLE out loud rather than
// quietly passing.
//
// Each control cites the incident that earned it. None was invented from a
// framework; all of them are things that already went wrong in this fleet, most
// of them measured on 2026-08-14.
//
// THREE OUTCOMES, NEVER TWO:
//   ENFORCED        — the control ran and the tree satisfies it
//   VIOLATION       — the control ran and the tree does not satisfy it (exit 1)
//   NOT ENFORCEABLE — the control cannot be decided from this repo, and says so
//
// The third exists because the alternative is worse. A control that silently
// downgrades to "pass" when it cannot see its subject is how "we did not look"
// becomes "it passed" — see LESSONS, and the two figures this very assessment
// had to retract for exactly that reason.
//
// DOMAIN COVERAGE. One control per domain of the Software Trust Foundation.
// Coverage is deliberately shallow-and-real rather than broad-and-asserted: a
// single enforced control per domain is worth more than a matrix of prose.
// Where a domain's real risk is NOT statically checkable, the control says so
// and names what would be needed.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.claude', '.vercel', 'out', 'tool-results', 'scratch',
]);

/** Every file under `dir` whose name matches `test`. */
function walk(dir, test, acc = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const rel = join(dir, entry);
    let st;
    try {
      st = statSync(join(ROOT, rel));
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(rel, test, acc);
    else if (test(entry)) acc.push(rel);
  }
  return acc;
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const isTs = (f) => /\.(ts|tsx|mts)$/.test(f) && !/\.d\.ts$/.test(f);

/**
 * Strip line and block comments before pattern-matching source.
 *
 * Without this the checker flags the prose that DOCUMENTS a rule as a breach of
 * it. That is not hypothetical: scan-secrets.mjs already carries a note that the
 * first draft of its own explanatory comment tripped its own detector, and the
 * retraction guard caught the first draft of a retraction earlier today. A
 * checker that cannot tell code from commentary generates false positives, and
 * false positives are how a gate gets ignored.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const results = [];
const record = (id, domain, status, detail, why) =>
  results.push({ id, domain, status, detail, why });

// ── TF-01 · AI Runtime Security ──────────────────────────────────────────────
// No Supabase client may be constructed at MODULE SCOPE.
//
// EARNED: `next build` collects page data by importing every route module, so a
// module-scope client is instantiated at BUILD time and throws when no key is
// present. CLAUDE.md records that this broke every deployment of this project
// from 2026-06-05 to 2026-08-11. It is not historical: on 2026-08-14 the
// trustrails-dev production build failed with `Error: supabaseUrl is required`
// during "Collecting page data", from module-scope createClient() in 6+ routes.
{
  const offenders = [];
  for (const file of [...walk('app', isTs), ...walk('lib', isTs), ...walk('components', isTs)]) {
    const src = stripComments(read(file));
    src.split('\n').forEach((line, i) => {
      // Column 0 with a declaration keyword == module scope. Anything indented
      // is inside a function or block, which is the correct shape.
      if (/^(export\s+)?(const|let|var)\s+\w+\s*(:[^=]+)?=\s*createClient\s*\(/.test(line)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  record(
    'TF-01', 'AI Runtime Security',
    offenders.length ? 'VIOLATION' : 'ENFORCED',
    offenders.length ? `module-scope client at ${offenders.join(', ')}` : 'no module-scope Supabase client',
    'build-time credential dependency; broke every deploy 2026-06-05→08-11',
  );
}

// ── TF-02 · AI Development Security ──────────────────────────────────────────
// Supabase clients come from the shared helpers, not from ad-hoc construction.
//
// EARNED: on 2026-08-14 lib/trust/cross-llm-verifier.ts was found building its
// own client that read ONLY the legacy key names. It could not see
// SUPABASE_SECRET_KEY — the name this project actually uses, the legacy JWTs
// being disabled project-wide — so in the documented target state it returned
// null and the caller's `if (!supabase) return` silently dropped every record.
// One place that knows how this project authenticates is the whole point.
//
// `import type` is exempt: a type import constructs nothing.
{
  const ALLOWED = new Set(['lib/supabase-admin.ts', 'lib/supabase-browser.ts']);
  const offenders = [];
  for (const file of [...walk('app', isTs), ...walk('lib', isTs), ...walk('components', isTs)]) {
    if (ALLOWED.has(file)) continue;
    const src = stripComments(read(file));
    if (/import\s+(?!type\b)[^;]*\bcreateClient\b[^;]*from\s+['"]@supabase\/supabase-js['"]/.test(src)) {
      offenders.push(file);
    }
  }
  record(
    'TF-02', 'AI Development Security',
    offenders.length ? 'VIOLATION' : 'ENFORCED',
    offenders.length
      ? `constructs its own client: ${offenders.join(', ')} — use getSupabaseAdmin()/getSupabaseBrowser()`
      : 'all clients come from the shared helpers',
    'ad-hoc clients read stale key names and fail silently',
  );
}

// ── TF-03 · AI Knowledge Security ────────────────────────────────────────────
// Client code must read NEXT_PUBLIC_* as literal references.
//
// EARNED: CLAUDE.md — `NEXT_PUBLIC_*` is inlined by STATIC ANALYSIS of literal
// references. `process.env[name]` is not inlined and is `undefined` in the
// browser. A dynamic read compiles, ships, and fails only at runtime in the
// user's browser, which is the worst place to discover it. Server code may loop;
// this control is scoped to files marked 'use client'.
{
  const offenders = [];
  for (const file of [...walk('app', isTs), ...walk('components', isTs), ...walk('lib', isTs)]) {
    const raw = read(file);
    if (!/^\s*['"]use client['"]/m.test(raw)) continue;
    const src = stripComments(raw);
    if (/process\.env\s*\[/.test(src)) offenders.push(file);
  }
  record(
    'TF-03', 'AI Knowledge Security',
    offenders.length ? 'VIOLATION' : 'ENFORCED',
    offenders.length
      ? `dynamic process.env[...] in client code: ${offenders.join(', ')}`
      : `no dynamic env reads in client code`,
    'NEXT_PUBLIC_* is inlined by literal reference only; dynamic reads are undefined in the browser',
  );
}

// ── TF-04 · AI Governance ────────────────────────────────────────────────────
// The claim-discipline gate must itself be wired into the gate.
//
// EARNED: trustshell shipped a real, well-built workflow that triggered only on
// tags — so it had never once run on a pull request. An audit that counts
// workflow FILES scored it as having CI; an audit that counts gating checks
// scored it as having none. A control that exists but never runs is decoration,
// and this is the meta-case: check:prior-work is what stops retracted figures
// from reappearing, and it is worth nothing if it is not in `npm run check`.
{
  // ASK THE RUNNER, do not pattern-match its command string.
  //
  // `npm run check` used to be one long `&&` chain naming every suite, so a
  // substring test answered this. It is now `node scripts/check-all.mjs`, which
  // DISCOVERS suites — so the names are no longer in the string, and a
  // substring test would report VIOLATION over a gate that does run.
  //
  // Asking the runner is also a STRONGER control than the string test was: it
  // reports what will actually execute, so it still fires if a gate is defined
  // but skipped by discovery — a case the substring version could not see.
  // The chain fallback is kept so this control survives a revert.
  const pkg = JSON.parse(read('package.json'));
  const chain = pkg.scripts?.check ?? '';
  const required = ['check:prior-work', 'check:secrets'];

  let gates = null;
  let how = 'the check chain';
  if (/check-all\.mjs/.test(chain)) {
    const listed = spawnSync('node', ['scripts/check-all.mjs', '--list'], {
      cwd: ROOT, encoding: 'utf8',
    });
    if (listed.status === 0) {
      gates = listed.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      how = 'the discovered suite list';
    }
  }

  // A runner that cannot say what it runs is itself the violation: nothing here
  // may fall back to "assume it is fine".
  const missing = gates === null
    ? required.filter((s) => !chain.includes(s))
    : required.filter((s) => !gates.includes(s));

  record(
    'TF-04', 'AI Governance',
    missing.length ? 'VIOLATION' : 'ENFORCED',
    missing.length
      ? `absent from ${how}: ${missing.join(', ')}`
      : `claim + secret gates run (verified against ${how}${gates ? `, ${gates.length} suites` : ''})`,
    'a gate that never runs is decoration',
  );
}

// ── TF-05 · AI Observability ─────────────────────────────────────────────────
// The app must be able to say which commit it is running, uncached.
//
// EARNED: 4 of 6 surfaces had no deploy-provenance endpoint. On 2026-08-14 that
// cost two successive WRONG conclusions about what hyperdag.org was serving —
// the first alarming and published, the second reached only after cross-checking
// project metadata, deployment lists and content hashes across two APIs. One
// self-reported field would have settled it in a single request. The no-store
// requirement is equally earned: `www` was observed serving `x-vercel-cache:
// HIT`, and a cached version endpoint reports the PREVIOUS deployment's SHA —
// answering confidently and wrongly, which is worse than not answering.
{
  const route = 'app/api/version/route.ts';
  if (!existsSync(join(ROOT, route))) {
    record('TF-05', 'AI Observability', 'VIOLATION', `${route} is missing`, 'no way to ask a deployment what it is');
  } else {
    const src = read(route);
    const problems = [];
    if (!/no-store/.test(src)) problems.push('does not set cache-control: no-store');
    if (!/force-dynamic/.test(src)) problems.push('is not force-dynamic');
    record(
      'TF-05', 'AI Observability',
      problems.length ? 'VIOLATION' : 'ENFORCED',
      problems.length ? `${route} ${problems.join('; ')}` : 'version endpoint present, dynamic and uncached',
      'a cached version endpoint reports the previous deployment',
    );
  }
}

// ── TF-06 · Identity & Trust ─────────────────────────────────────────────────
// A migration that creates a table must also enable RLS on it.
//
// EARNED: 15 tables were found with RLS disabled entirely and full anon
// INSERT/UPDATE/DELETE grants, among them agent_preflight_control — the
// `global_pause` switch every agent is required to obey. It was anonymously
// settable with a key that ships in the browser bundle until it was closed on
// 2026-08-14. This control is the preventive half: it cannot fix the 59 tables
// that remain open, but it stops the 60th from being created.
{
  const migrations = existsSync(join(ROOT, 'supabase/migrations'))
    ? walk('supabase/migrations', (f) => f.endsWith('.sql'))
    : [];
  if (!migrations.length) {
    record('TF-06', 'Identity & Trust', 'NOT ENFORCEABLE', 'no supabase/migrations directory in this repo', 'nothing to check');
  } else {
    const offenders = [];
    for (const file of migrations) {
      const sql = read(file).replace(/--.*$/gm, '');
      const creates = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)].map((m) =>
        m[1].replace(/^public\./i, ''),
      );
      if (!creates.length) continue;
      const rlsOn = new Set(
        [...sql.matchAll(/alter\s+table\s+(?:only\s+)?([\w.]+)\s+enable\s+row\s+level\s+security/gi)].map((m) =>
          m[1].replace(/^public\./i, ''),
        ),
      );
      for (const t of creates) if (!rlsOn.has(t)) offenders.push(`${file} → ${t}`);
    }
    record(
      'TF-06', 'Identity & Trust',
      offenders.length ? 'VIOLATION' : 'ENFORCED',
      offenders.length
        ? `table created without RLS: ${offenders.join(', ')}`
        : `${migrations.length} migrations: every created table enables RLS`,
      'RLS off + an anon grant is open season; that is how the pause switch became writable',
    );
  }
}

// ── TF-07 · AIOps and Remediation ────────────────────────────────────────────
// At least one workflow must actually gate pull requests.
//
// EARNED: same trustshell case as TF-04, from the other side. The repo had a
// workflow and no gate. Counting files answers the wrong question.
{
  const dir = '.github/workflows';
  if (!existsSync(join(ROOT, dir))) {
    record('TF-07', 'AIOps and Remediation', 'VIOLATION', 'no .github/workflows directory', 'nothing runs on a PR');
  } else {
    const flows = walk(dir, (f) => /\.ya?ml$/.test(f));
    const gating = flows.filter((f) => /^\s*pull_request\s*:/m.test(read(f)));
    record(
      'TF-07', 'AIOps and Remediation',
      gating.length ? 'ENFORCED' : 'VIOLATION',
      gating.length
        ? `${gating.length} of ${flows.length} workflow(s) trigger on pull_request`
        : `${flows.length} workflow(s) exist and NONE trigger on pull_request`,
      'a workflow that only fires on tags has never checked a PR',
    );
  }
}

// ── TF-08 · AI Agent Security ────────────────────────────────────────────────
// No gating step may be allowed to fail silently.
//
// EARNED: `continue-on-error: true` renders a failed step as a GREEN TICK. That
// is the two-outcome collapse this codebase keeps paying for — a skipped test
// scored as a pass, a build green over undefined references, a credential check
// green with no credential, three instances in one session in three unrelated
// components. Where a job genuinely should not gate (a baseline recorder), it
// must say so in three outcomes and exit 0 on purpose, not wear a false green.
{
  const dir = '.github/workflows';
  const flows = existsSync(join(ROOT, dir)) ? walk(dir, (f) => /\.ya?ml$/.test(f)) : [];
  const offenders = flows.filter((f) => /continue-on-error:\s*true/.test(read(f)));
  record(
    'TF-08', 'AI Agent Security',
    offenders.length ? 'VIOLATION' : 'ENFORCED',
    offenders.length
      ? `continue-on-error masks failure in: ${offenders.join(', ')}`
      : `${flows.length} workflow(s): no step is allowed to fail silently`,
    'a failed step allowed to pass renders as a green tick',
  );
}

// ── TF-09 · Identity & Trust (privilege) ─────────────────────────────────────
// A privileged key must never fall back to a PUBLIC one.
//
// EARNED TWICE IN ONE DAY, which is why it is a control rather than a note.
//
//   1. lib/trust/cross-llm-verifier.ts resolved only the LEGACY service names,
//      could not see SUPABASE_SECRET_KEY, and returned null — the caller's
//      `if (!supabase) return` then dropped every record silently.
//   2. trustrails-dev's lib/trustshell/* resolve
//      `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. The legacy
//      name is a DISABLED JWT on this project, so the live fallback is the
//      PUBLIC key — a server-side writer silently degrading to anon privileges.
//      That was measured across 17 files there on 2026-08-14, and it is the
//      reason the anon INSERT policy on the agent-memory tables could not be
//      revoked in the same change that removed anon DELETE.
//
// The shape is what makes it dangerous: `||` reads as a safe default, and it is
// the opposite. A missing privileged key should FAIL LOUDLY — getSupabaseAdmin()
// throws, which is correct — not quietly continue with less authority than the
// code believes it has. Silent privilege downgrade is indistinguishable from
// working, right up until a policy tightens.
//
// SCOPED to runtime paths (app/, lib/, supabase/). Dev scripts are excluded
// deliberately: a one-off script falling back to anon is a much smaller blast
// radius than a request handler doing it, and a control that flags both equally
// gets muted. Stated rather than left implicit, since an unexplained exclusion
// is how scope quietly becomes a loophole.
{
  const PRIVILEGED = /(SECRET_KEY|SERVICE_ROLE_KEY|SERVICE_KEY)/;
  const PUBLIC_KEY = /(NEXT_PUBLIC_[A-Z_]*KEY|ANON_KEY|PUBLISHABLE)/;
  const offenders = [];
  for (const file of [...walk('app', isTs), ...walk('lib', isTs), ...walk('supabase', isTs)]) {
    const src = stripComments(read(file));
    src.split('\n').forEach((line, i) => {
      // Same expression, privileged first, public as the `||` fallback.
      if (line.includes('||') && PRIVILEGED.test(line) && PUBLIC_KEY.test(line)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  record(
    'TF-09', 'Identity & Trust (privilege)',
    offenders.length ? 'VIOLATION' : 'ENFORCED',
    offenders.length
      ? `privileged key falls back to a PUBLIC key at ${offenders.join(', ')}`
      : 'no privileged key falls back to a public one in a runtime path',
    'silent privilege downgrade: the code keeps working with less authority than it believes it has',
  );
}

// ── Report ───────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const violations = results.filter((r) => r.status === 'VIOLATION');
const unenforceable = results.filter((r) => r.status === 'NOT ENFORCEABLE');

console.log('\nSoftware Trust Foundation — enforced controls\n');
for (const r of results) {
  const mark = r.status === 'ENFORCED' ? '✓' : r.status === 'VIOLATION' ? '✗' : '·';
  console.log(`  ${mark} ${pad(r.id, 7)} ${pad(r.domain, 26)} ${r.status}`);
  console.log(`    ${r.detail}`);
  if (r.status !== 'ENFORCED') console.log(`    why it exists: ${r.why}`);
}

console.log(
  `\ncheck:trust — ${results.length - violations.length - unenforceable.length} ENFORCED, ` +
    `${violations.length} VIOLATION, ${unenforceable.length} NOT ENFORCEABLE.`,
);

if (unenforceable.length) {
  console.log(
    'NOT ENFORCEABLE is reported rather than passed: a control that cannot see its\n' +
      'subject has not verified anything, and saying so is the difference between\n' +
      '"we did not look" and "it passed".',
  );
}

if (violations.length) {
  console.error('\nFAILED. Each violation above names the incident that earned the control.');
  process.exit(1);
}
