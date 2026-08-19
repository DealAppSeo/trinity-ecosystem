#!/usr/bin/env node
//
// check-open-index.mjs — assertions for the OPEN-list parser and matcher.
//
//   npm run check:open-index
//
// The live gate is `check:open-work`; it needs a git diff and therefore cannot
// assert its own logic against fixtures. This does, and it is the only reason a
// green run of that gate means anything.
//
// The primary fixture is the REAL entry that caught a session on 2026-08-16 —
// the HAL 22:18 outage, root-caused a day earlier and re-derived anyway. If a
// change stops that entry matching a diff about `hal_classifications`, these go
// red.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.open-index-check-'));
let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/priorwork/open-index.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'priorwork', 'open-index.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — open-index does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const { parseOpenEntries, entriesTouched, scopeMatches, isAcknowledged, slugify, assessChange } = mod;

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// --- the real index ---------------------------------------------------------

const real = parseOpenEntries(readFileSync('docs/PRIOR-WORK-INDEX.md', 'utf8'));
ok('the real OPEN list parses to at least one entry', real.length > 0, `got ${real.length}`);
ok('at least one real entry carries a [scope: …] marker',
   real.some((e) => e.scope.length > 0));

const hal = real.find((e) => e.item.includes('22:18'));
ok('the HAL 22:18 entry is present', !!hal);
if (hal) {
  ok('it is scoped', hal.scope.length > 0, JSON.stringify(hal.scope));
  ok('it names an owner', hal.owner.length > 0, hal.owner);
  ok('its note retains the ruled-out evidence', hal.note.includes('pg_cron'));
  const touched = entriesTouched(real, {
    paths: ['scripts/whatever.mjs'],
    diffText: "supabase.from('hal_classifications')",
  });
  ok('a diff mentioning hal_classifications matches it',
     touched.some((e) => e.item.includes('22:18')),
     `matched ${touched.length}`);
}

// --- CLOSED and RETRACTED must not be picked up -----------------------------
//
// Both have the same table shape. Closed work is meant to be built on; retracted
// figures are governed by check:prior-work. Pulling them in would make the gate
// fire on everything, which is how a gate gets routed around.

const mixed = `
## CLOSED — do not reopen without new evidence

| area | verdict | evidence |
|---|---|---|
| Something closed | done | [scope: closed_table] |

## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| The open thing | Sean | covers it [scope: open_table] |

## RETRACTED — never cite these

| claim | why it is wrong | correct position |
|---|---|---|
| A retracted number | bad sample | [scope: retracted_table] |
`;
const parsed = parseOpenEntries(mixed);
ok('only the OPEN section is parsed', parsed.length === 1, `got ${parsed.length}`);
ok('the OPEN row is the one parsed', parsed[0]?.item === 'The open thing');
ok('a CLOSED scope token never matches',
   entriesTouched(parsed, { paths: [], diffText: 'closed_table' }).length === 0);
ok('a RETRACTED scope token never matches',
   entriesTouched(parsed, { paths: [], diffText: 'retracted_table' }).length === 0);

// --- scope is opt-in --------------------------------------------------------

const advisory = parseOpenEntries(`
## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| No scope here | Sean | plain prose about hal_classifications |
`);
ok('an entry without [scope:] parses', advisory.length === 1);
ok('an ADVISORY entry can never fail a build',
   entriesTouched(advisory, { paths: [], diffText: 'hal_classifications' }).length === 0,
   'an unscoped entry matched, so every diff would fire');

// --- matching ---------------------------------------------------------------

const CH = (paths, diffText = '') => ({ paths, diffText });
ok('a trailing-slash token is a path prefix',
   scopeMatches('lib/trustshell/', CH(['lib/trustshell/x.ts'])));
ok('a path prefix does not match a different tree',
   !scopeMatches('lib/trustshell/', CH(['app/api/x.ts'])));
ok('a bare token matches a path substring',
   scopeMatches('receipt', CH(['lib/trustshell/receipt/build.ts'])));
ok('a bare token matches a whole word in the diff',
   scopeMatches('hal_classifications', CH([], 'insert into hal_classifications (a)')));

// The near-name trap, same one the decoy gate exists for: a scope token must not
// match a longer name and send somebody to the wrong entry.
ok('repid_events does NOT match trinity_repid_events',
   !scopeMatches('repid_events', CH([], 'select * from trinity_repid_events')));
ok('hal_classifications does not match hal_classifications_v2',
   !scopeMatches('hal_classifications', CH([], 'from hal_classifications_v2')));
ok('a token is matched when it stands alone even next to punctuation',
   scopeMatches('agent_heartbeat', CH([], 'update public.agent_heartbeat;')));

// --- acknowledgement --------------------------------------------------------

const e = parseOpenEntries(`
## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| HAL volume stopped 2026-07-17 22:18 UTC and stayed down | Sean | why [scope: hal_classifications] |
`)[0];

ok('slug is stable and citable', /^[a-z0-9-]+$/.test(e.slug), e.slug);
ok('an exact PRIOR-WORK citation acknowledges',
   isAcknowledged(e, `fix: something\n\nPRIOR-WORK: ${e.slug}\n`, ''));
ok('citation is case-insensitive',
   isAcknowledged(e, `prior-work: ${e.slug.toUpperCase()}`, ''));
ok('a DIFFERENT slug does not acknowledge',
   !isAcknowledged(e, 'PRIOR-WORK: some-other-entry', ''));
ok('a partial slug does not acknowledge',
   !isAcknowledged(e, `PRIOR-WORK: ${e.slug}-extra`, ''),
   'a longer slug matched the shorter one');
ok('no citation and no index edit is NOT acknowledged',
   !isAcknowledged(e, 'fix: unrelated work', ''));
// The defect this gate found in itself, minutes after being written: the probe
// is markdown-stripped, so an item whose title contains backticks never matched
// its own edit. It reported "Task key on `repid_score_events`" as unacknowledged
// in the very commit that edited that row.
ok('an entry whose title contains backticks matches its own edit',
   isAcknowledged(
     parseOpenEntries(`
## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| Task key on \`repid_score_events\` | Sean | blocker [scope: repid_score_events] |
`)[0],
     'no citation',
     '+| **Task key on `repid_score_events`** | **Sean** | updated |'
   ),
   'a backticked title did not match the raw diff of its own row');

ok('editing the entry itself acknowledges',
   isAcknowledged(e, 'fix: unrelated', `+| ${e.item} | Sean | updated |`),
   'updating what you learned is evidence of having read it');

// --- the whole assessment ---------------------------------------------------

const verdicts = assessChange(
  [e],
  CH(['scripts/x.mjs'], "from('hal_classifications')"),
  'no citation here',
  ''
);
ok('an untouched-but-matched entry is reported', verdicts.length === 1);
ok('and reported as unacknowledged', verdicts[0]?.acknowledged === false);
ok('and says which token matched', verdicts[0]?.matchedOn.includes('hal_classifications'));

const clean = assessChange([e], CH(['README.md'], 'nothing relevant'), '', '');
ok('an unrelated diff matches nothing', clean.length === 0);

ok('slugify is deterministic', slugify('A Thing') === slugify('A Thing'));
ok('slugify strips markdown emphasis', !slugify('**Bold** item').includes('*'));

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAILED — open-index: ${failures.length} of ${pass + failures.length} assertions\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:open-index — VERIFIED. ${pass} assertions; ${real.length} open entries parse, ` +
  `${real.filter((x) => x.scope.length > 0).length} scoped.`);
