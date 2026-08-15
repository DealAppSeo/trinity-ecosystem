#!/usr/bin/env node
//
// check-claims.mjs — assertions for T0/T1 claim checking. TrustShell M4.
//
// M4's acceptance criterion is two-part: "Catches >=1 real LESSONS.md entry;
// false-positive rate measured and published." Both halves are here.
//
// The two FIXTURES THAT MATTER pull in opposite directions, and a detector has
// to satisfy both at once or it is worthless:
//
//   CATCH  — the 2026-08-12 scan-secrets failure, reconstructed from LESSONS:
//            `git grep` exited 128 and never ran, and the agent reported "No
//            credential-shaped strings found" anyway. If T1 stops catching this,
//            the tier has been tuned into decoration.
//
//   STAY SILENT — the two false positives the first draft raised on the one real
//            session available. Both are encoded below. If either fires again,
//            the tier is back to crying wolf.
//
// A detector that only ever fires and one that never fires are equally useless,
// so both directions are asserted and neither is allowed to regress.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.claims-check-'));
let R, P;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/receipt/index.ts',
      'lib/trustshell/TranscriptParser.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  R = await import(pathToFileURL(join(outDir, 'trustshell', 'receipt', 'index.js')).href);
  P = await import(pathToFileURL(join(outDir, 'trustshell', 'TranscriptParser.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error(`FAILED — claims modules do not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, a, b) =>
  ok(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ---------------------------------------------------------------------------
// Transcript builder
// ---------------------------------------------------------------------------

let clock = 0;
const t = () => new Date(Date.parse('2026-08-15T10:00:00.000Z') + clock++ * 1000).toISOString();

function build(steps) {
  clock = 0;
  const lines = [];
  let n = 0;
  const push = (o) => lines.push(JSON.stringify(o));
  push({
    type: 'user', uuid: 'u0', parentUuid: null, timestamp: t(),
    sessionId: 's', cwd: '/repo', gitBranch: 'main',
    message: { role: 'user', content: [{ type: 'text', text: 'go' }] },
  });
  for (const step of steps) {
    n += 1;
    if (step.tool) {
      push({
        type: 'assistant', uuid: `a${n}`, parentUuid: null, timestamp: t(),
        sessionId: 's', requestId: `r${n}`,
        message: {
          role: 'assistant', model: 'm',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [{ type: 'tool_use', id: `toolu_${n}`, name: step.tool, input: step.input ?? {} }],
        },
      });
      if (step.outcome !== 'orphan') {
        push({
          type: 'user', uuid: `ur${n}`, parentUuid: `a${n}`, timestamp: t(), sessionId: 's',
          // toolDenialKind rides on the RESULT record, not the call. Putting it
          // on the assistant record produced a fixture the parser scored as `ok`,
          // and the assertion failed for a reason that had nothing to do with
          // the detector under test.
          ...(step.outcome === 'denied' ? { toolDenialKind: 'permission' } : {}),
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: `toolu_${n}`, is_error: step.outcome === 'error', content: step.result ?? 'ok' }],
          },
        });
      }
    }
    if (step.say) {
      push({
        type: 'assistant', uuid: `s${n}`, parentUuid: null, timestamp: t(),
        sessionId: 's', requestId: `rs${n}`,
        message: {
          role: 'assistant', model: 'm',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [{ type: 'text', text: step.say }],
        },
      });
    }
  }
  return P.parseTranscript(lines.join('\n'), { sha256: 'a'.repeat(64) });
}

const verdicts = (parsed, tiers = { t0: true, t1: true }) =>
  R.checkClaims(parsed, tiers).findings.map((f) => `${f.tier}/${f.verdict}`);
const counts = (parsed, tiers = { t0: true, t1: true }) => R.checkClaims(parsed, tiers);

// ---------------------------------------------------------------------------
// CATCH — the real LESSONS.md failure, 2026-08-12
//
// RECONSTRUCTED, not recovered. LESSONS records the failure in prose; the
// original transcript is not in this container. The tool/result/claim shape is
// taken directly from that entry: a Bash call that errored, followed by an
// assertion that nothing was found.
// ---------------------------------------------------------------------------

{
  const parsed = build([
    {
      tool: 'Bash',
      input: { command: 'node scripts/scan-secrets.mjs --history' },
      outcome: 'error',
      result: 'fatal: this operation must be run in a work tree\nexit 128',
    },
    { say: 'History scan complete. No credential-shaped strings found across the full git history.' },
  ]);
  const c = counts(parsed);
  eq('LESSONS scan-secrets: contradicted', c.failed, 1);
  ok('LESSONS scan-secrets: T1 raised it', verdicts(parsed).includes('T1/contradicted'), JSON.stringify(verdicts(parsed)));
  ok('LESSONS scan-secrets: finding names the failing tool',
     c.findings.some((f) => (f.evidenceRef ?? '').includes('Bash:error')), JSON.stringify(c.findings));
  // The hyphen in "credential-shaped" is why the first draft MISSED this: \w
  // does not span a hyphen. Asserted directly so the class cannot regress.
  ok('hyphenated nouns do not break the "no X found" rule',
     counts(build([
       { tool: 'Bash', outcome: 'error', result: 'exit 1' },
       { say: 'No credential-shaped strings found.' },
     ])).failed === 1);
}

// A denied tool, claimed as done.
{
  const parsed = build([
    { tool: 'Bash', input: { command: 'rm -rf /' }, outcome: 'denied' },
    { say: 'Cleanup succeeded.' },
  ]);
  eq('denied tool claimed as success: contradicted', counts(parsed).failed, 1);
}

// ---------------------------------------------------------------------------
// STAY SILENT — the two false positives measured on the real session.
// Regression fixtures. Each one drove a rule change; each must stay quiet.
// ---------------------------------------------------------------------------

{
  // FP1: "VERIFIED" is this repo's epistemic tag, not a claim about the adjacent
  // call. It sat next to a denied add_repo and was scored as a contradiction.
  const parsed = build([
    { tool: 'Bash', outcome: 'denied' },
    { say: 'Access = GitHub yes (MCP), Supabase yes (MCP), Railway no. [VERIFIED this session]' },
  ]);
  eq('FP1 regression: "VERIFIED" as an epistemic tag stays silent', counts(parsed).failed, 0);
}
{
  // FP2: "green" described a CI job nowhere near the linked call.
  const parsed = build([
    { tool: 'Bash', outcome: 'error', result: 'KeyError' },
    { say: 'CI is healthy — b53ae9c went fully green (check + prior-work). Head e09b23e is running.' },
  ]);
  eq('FP2 regression: "green" about something else stays silent', counts(parsed).failed, 0);
}
{
  // The structural cause of both: a success claim over MANY calls, only one of
  // which failed, and not the last one.
  const parsed = build([
    { tool: 'Bash', outcome: 'error', result: 'exit 1' },
    { tool: 'Read', outcome: 'ok' },
    { say: 'The suite passed with exit 0.' },
  ]);
  eq('an earlier unrelated failure does not contradict', counts(parsed).failed, 0);
  // ...but the immediately preceding failure still does.
  const parsed2 = build([
    { tool: 'Read', outcome: 'ok' },
    { tool: 'Bash', outcome: 'error', result: 'exit 1' },
    { say: 'The suite passed with exit 0.' },
  ]);
  eq('the immediately preceding failure does contradict', counts(parsed2).failed, 1);
}
{
  // Honest reporting of a failure must never be scored as a false claim.
  const parsed = build([
    { tool: 'Bash', outcome: 'error', result: 'exit 1' },
    { say: 'That failed with exit 1, as expected — the earlier run had passed.' },
  ]);
  eq('acknowledged failure is not a false claim', counts(parsed).failed, 0);
}

// ---------------------------------------------------------------------------
// T0
// ---------------------------------------------------------------------------

{
  const parsed = build([{ tool: 'Read', outcome: 'ok' }, { say: 'I ran `mcp__nowhere__nothing` to confirm.' }]);
  eq('T0: completive claim of an unused tool is contradicted', counts(parsed).failed, 1);
}
{
  const parsed = build([{ tool: 'Read', outcome: 'ok' }, { say: 'You could use `Bash` for that.' }]);
  eq('T0: a bare mention is not a contradiction', counts(parsed).failed, 0);
  ok('T0: a bare mention is unchecked, not silent', counts(parsed).unchecked > 0);
}
{
  const parsed = build([{ tool: 'Grep', outcome: 'ok' }, { say: 'I ran `Grep` across the tree.' }]);
  const v = verdicts(parsed);
  ok('T0: completive claim of a USED tool is backed', v.includes('T0/backed'), JSON.stringify(v));
  eq('T0: and not contradicted', counts(parsed).failed, 0);
}
{
  const parsed = build([
    { tool: 'Read', outcome: 'ok' },
    { say: 'Example usage:\n```\nI ran `mcp__nowhere__nothing`\n```\nThat is how it would look.' },
  ]);
  eq('T0: fenced code is not a claim', counts(parsed).failed, 0);
}
{
  const parsed = build([{ tool: 'Read', outcome: 'ok' }, { say: 'I will call `mcp__nowhere__nothing` next.' }]);
  eq('T0: future tense is not a completive claim', counts(parsed).failed, 0);
}
{
  const parsed = build([{ tool: 'Read', outcome: 'ok' }, { say: 'I am running `mcp__nowhere__nothing` now.' }]);
  eq('T0: present progressive is not a completive claim', counts(parsed).failed, 0);
}
{
  // Ordinary English words must never trip T0 unbackticked.
  const parsed = build([
    { tool: 'Grep', outcome: 'ok' },
    { say: 'I read the file, wrote a note, edited the task and used bash-like syntax.' },
  ]);
  eq('T0: unbackticked ordinary words do not fire', counts(parsed).failed, 0);
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

{
  const parsed = build([
    { tool: 'Bash', outcome: 'error', result: 'exit 1' },
    { say: 'The build passed.' },
    { tool: 'Read', outcome: 'ok' },
    { say: 'Then I read the file.' },
    { say: 'Some prose with no assertion in it at all.' },
  ]);
  const c = counts(parsed);
  eq('every span is accounted for', c.verified + c.unchecked + c.failed, c.total);
  eq('total counts spans, not findings', c.total, parsed.claims.length);
  ok('T1 never emits backed',
     !c.findings.some((f) => f.tier === 'T1' && f.verdict === 'backed'),
     JSON.stringify(c.findings));
}
{
  // The branch the assertion above must actually reach.
  //
  // Its first version used a fixture where no span ever hit "success claim,
  // linked call succeeded" — so it passed vacuously, and a mutation that
  // restored T1/backed survived the whole suite. An invariant asserted over a
  // situation that never arises is not an invariant, it is a comment.
  const parsed = build([
    { tool: 'Bash', outcome: 'ok', result: 'exit 0' },
    { say: 'The suite passed with exit 0.' },
  ]);
  const c = counts(parsed);
  ok('a success claim over a SUCCESSFUL call reaches the no-contradiction branch',
     c.findings.some((f) => f.tier === 'T1'), JSON.stringify(c.findings));
  eq('...and is unchecked, never backed — absence of contradiction is not support',
     c.findings.find((f) => f.tier === 'T1')?.verdict, 'unchecked');
  eq('...so it cannot lift the receipt to VERIFIED', c.verified, 0);
}
{
  // Disabled tiers must produce zeros, so markerFor renders NOT_CHECKED.
  const parsed = build([{ tool: 'Bash', outcome: 'error' }, { say: 'It passed with exit 0.' }]);
  const off = counts(parsed, { t0: false, t1: false });
  eq('no tier enabled: total is zero', off.total, 0);
  eq('no tier enabled: no findings', off.findings.length, 0);
  eq('no tier enabled: marker is NOT_CHECKED',
     R.markerFor({ claims: off, ruleset: R.M2_RULESET, internalErrors: [] }), 'NOT_CHECKED');
  // ...and with a tier on, the same session is FAILED, not silently clean.
  const on = counts(parsed);
  eq('tier enabled: the same session is FAILED',
     R.markerFor({ claims: on, ruleset: { ...R.M2_RULESET, claimsT1: true }, internalErrors: [] }), 'FAILED');
}
{
  // A claim with no timestamp cannot be linked, and unlinkable is not clean.
  const parsed = P.parseTranscript(
    JSON.stringify({
      type: 'assistant', uuid: 'x', message: { role: 'assistant', model: 'm', content: [{ type: 'text', text: 'It passed with exit 0.' }] },
    }),
    { sha256: 'b'.repeat(64) }
  );
  const c = counts(parsed);
  eq('unlinkable claim is unchecked, not clean', c.unchecked, 1);
  eq('unlinkable claim is not contradicted', c.failed, 0);
}
{
  // Excerpts are bounded — a receipt must not become a transcript leak.
  const long = `The suite passed with exit 0. ${'x'.repeat(2000)}`;
  const parsed = build([{ tool: 'Bash', outcome: 'error' }, { say: long }]);
  const f = counts(parsed).findings[0];
  ok('excerpt is bounded', f.claimSpan.length <= R.EXCERPT_MAX, `${f.claimSpan.length} chars`);
}
{
  // Findings must be order-stable, or the receipt hash moves between runs.
  const parsed = build([
    { tool: 'Bash', outcome: 'error' },
    { say: 'It passed with exit 0.' },
    { tool: 'Grep', outcome: 'ok' },
    { say: 'I ran `Grep` and it succeeded.' },
  ]);
  const a = JSON.stringify(counts(parsed).findings);
  const b = JSON.stringify(counts(parsed).findings);
  eq('findings are deterministic', a, b);
}
{
  // Thinking blocks are not claims.
  const line = JSON.stringify({
    type: 'assistant', uuid: 'k', timestamp: '2026-08-15T10:00:00.000Z',
    message: { role: 'assistant', model: 'm', content: [{ type: 'thinking', thinking: 'Maybe I ran `mcp__nowhere__nothing`?' }] },
  });
  const parsed = P.parseTranscript(line, { sha256: 'c'.repeat(64) });
  eq('thinking blocks are not claims', parsed.claims.length, 0);
  eq('...and produce no findings', counts(parsed).failed, 0);
}

// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} of ${pass + failures.length} assertions:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`VERIFIED — claim checking (M4): ${pass} assertions, 0 failed.`);
