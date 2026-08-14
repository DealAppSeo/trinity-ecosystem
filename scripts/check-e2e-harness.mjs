#!/usr/bin/env node
//
// check-e2e-harness.mjs — assertions for the E2E harness itself.
//
// A test harness is code, and this one exists specifically to prevent a class of
// bug that has shipped here before. So it gets tested like anything else, and it
// runs in `npm run check` because it needs no server and no build.
//
// Two things are under test:
//
//   1. THE LEDGER cannot report a green run that verified nothing. This is the
//      repid-engine #414 defect, reproduced deliberately below: a suite where
//      every step soft-skipped used to exit 0. Here it must not.
//
//   2. THE POSTGREST STUB speaks the dialect postgrest-js actually emits. It is
//      driven through a REAL supabase-js client rather than by hand-built URLs,
//      because a stub validated against my idea of the wire format would agree
//      with my idea of the wire format and prove nothing.

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { VerificationLedger, VERIFIED, NOT_CHECKED, FAILED } from './e2e/ledger.mjs';
import { createPostgrestStub } from './e2e/postgrest-stub.mjs';

let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------------------
// 1. The ledger
// ---------------------------------------------------------------------------

await check('a run where every step soft-skipped FAILS (repid-engine #414)', () => {
  const l = new VerificationLedger({ coreSteps: ['a', 'b', 'c'] });
  l.notChecked('a', 'endpoint 401');
  l.notChecked('b', 'endpoint 401');
  l.notChecked('c', 'endpoint 401');
  assert.equal(l.counts().failed, 0, 'nothing failed, which is exactly why this used to pass');
  assert.equal(l.exitCode(), 1, 'a run that verified nothing reported success');
  assert.match(l.violations().join(' '), /no core flow step was VERIFIED/);
});

await check('a single FAILED step fails the run', () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  l.verified('a', 'ok');
  l.failed('b', 'boom');
  assert.equal(l.exitCode(), 1);
});

await check('NOT CHECKED is tolerated when core steps were verified', () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  l.verified('a', 'ok');
  l.notChecked('b', 'no network');
  assert.equal(l.exitCode(), 0);
});

await check('--strict promotes NOT CHECKED to fatal', () => {
  const l = new VerificationLedger({ strict: true, coreSteps: ['a'] });
  l.verified('a', 'ok');
  l.notChecked('b', 'no network');
  assert.equal(l.exitCode(), 1);
  assert.match(l.violations().join(' '), /NOT CHECKED under --strict/);
});

await check('declaring no core steps is itself a violation', () => {
  const l = new VerificationLedger({ coreSteps: [] });
  l.verified('a', 'ok');
  assert.equal(l.exitCode(), 1, 'a suite with no declared core steps cannot show it tested anything');
});

await check('a step cannot be resolved twice', () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  l.notChecked('a', 'skipped');
  l.verified('a', 'sneaking a pass in afterwards');
  assert.equal(l.entries.get('a').outcome, NOT_CHECKED, 'the later resolution overwrote the honest one');
  assert.equal(l.exitCode(), 1);
  assert.match(l.violations().join(' '), /resolved more than once/);
});

await check('check() records a throw as FAILED, never as a skip', async () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  await l.check('a', () => { throw new Error('assertion blew up'); });
  assert.equal(l.entries.get('a').outcome, FAILED);
  assert.match(l.entries.get('a').note, /assertion blew up/);
  assert.equal(l.exitCode(), 1);
});

await check('check() records success as VERIFIED and passes the note through', async () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  await l.check('a', () => 'score=2960');
  assert.equal(l.entries.get('a').outcome, VERIFIED);
  assert.equal(l.entries.get('a').note, 'score=2960');
  assert.equal(l.exitCode(), 0);
});

await check('counts distinguish all three outcomes', async () => {
  const l = new VerificationLedger({ coreSteps: ['a'] });
  await l.check('a', () => {});
  l.notChecked('b', 'x');
  l.failed('c', 'y');
  const c = l.counts();
  assert.deepEqual(
    { verified: c.verified, notChecked: c.notChecked, failed: c.failed, coreVerified: c.coreVerified },
    { verified: 1, notChecked: 1, failed: 1, coreVerified: 1 },
  );
});

await check('report() returns false exactly when the run must fail', () => {
  const bad = new VerificationLedger({ coreSteps: ['a'] });
  bad.notChecked('a', 'x');
  assert.equal(bad.report(() => {}), false);

  const good = new VerificationLedger({ coreSteps: ['a'] });
  good.verified('a', 'ok');
  assert.equal(good.report(() => {}), true);
});

// ---------------------------------------------------------------------------
// 2. The PostgREST stub, driven by a real supabase-js client
// ---------------------------------------------------------------------------

const stub = createPostgrestStub({
  tables: {
    widgets: [
      { id: 1, name: 'alpha', qty: 5, at: '2026-01-01T00:00:00.000Z', flag: true },
      { id: 2, name: 'beta', qty: 10, at: '2026-02-01T00:00:00.000Z', flag: false },
      { id: 3, name: 'gamma', qty: 15, at: '2026-03-01T00:00:00.000Z', flag: true },
    ],
    empties: [],
  },
  primaryKeys: { widgets: 'id' },
  rpc: { widget_summary: { total: 30 } },
});

const url = await stub.listen();
const db = createClient(url, 'sb_secret_test');

await check('select + eq returns the matching row', async () => {
  const { data, error } = await db.from('widgets').select('*').eq('name', 'beta');
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 1);
  assert.equal(data[0].qty, 10);
});

await check('column projection returns only the requested columns', async () => {
  const { data } = await db.from('widgets').select('id, name').eq('id', 1);
  assert.deepEqual(Object.keys(data[0]).sort(), ['id', 'name']);
});

await check('gte on an ISO timestamp filters chronologically', async () => {
  const { data } = await db.from('widgets').select('id').gte('at', '2026-02-01T00:00:00.000Z');
  assert.deepEqual(data.map((r) => r.id).sort(), [2, 3]);
});

await check('numeric comparison coerces the query string', async () => {
  const { data } = await db.from('widgets').select('id').gt('qty', 6);
  assert.deepEqual(data.map((r) => r.id).sort(), [2, 3]);
});

await check('boolean is-filter works', async () => {
  const { data } = await db.from('widgets').select('id').is('flag', true);
  assert.deepEqual(data.map((r) => r.id).sort(), [1, 3]);
});

await check('in-filter works', async () => {
  const { data } = await db.from('widgets').select('id').in('name', ['alpha', 'gamma']);
  assert.deepEqual(data.map((r) => r.id).sort(), [1, 3]);
});

await check('order desc + limit behave like PostgREST', async () => {
  const { data } = await db.from('widgets').select('id').order('at', { ascending: false }).limit(2);
  assert.deepEqual(data.map((r) => r.id), [3, 2]);
});

await check('single() on exactly one row returns an object', async () => {
  const { data, error } = await db.from('widgets').select('*').eq('id', 2).single();
  assert.equal(error, null, error?.message);
  assert.equal(data.name, 'beta');
});

await check('single() on zero rows returns PGRST116, not null data with no error', async () => {
  const { data, error } = await db.from('widgets').select('*').eq('id', 999).single();
  assert.equal(data, null);
  assert.ok(error, 'no error surfaced for a single() that matched nothing');
  assert.equal(error.code, 'PGRST116');
});

await check('maybeSingle() on zero rows returns null data and no error', async () => {
  const { data, error } = await db.from('widgets').select('*').eq('id', 999).maybeSingle();
  assert.equal(error, null, error?.message);
  assert.equal(data, null);
});

await check('maybeSingle() on one row returns the object', async () => {
  const { data, error } = await db.from('widgets').select('id, name').eq('id', 3).maybeSingle();
  assert.equal(error, null, error?.message);
  assert.equal(data.name, 'gamma');
});

await check('an UNSEEDED table errors loudly instead of returning []', async () => {
  // The whole point: [] would be indistinguishable from "no matching rows", and
  // a route reading the wrong table would pass silently.
  const { data, error } = await db.from('no_such_table').select('*');
  assert.equal(data, null);
  assert.ok(error, 'querying an unseeded table succeeded with an empty result');
  assert.equal(error.code, 'PGRST205');
  assert.ok(stub.unseeded.has('no_such_table'), 'the unseeded table was not recorded for the report');
});

await check('a seeded but empty table returns [] with no error', async () => {
  const { data, error } = await db.from('empties').select('*');
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, []);
});

await check('insert persists and is readable back', async () => {
  const { error } = await db.from('widgets').insert({ id: 4, name: 'delta', qty: 20, at: '2026-04-01T00:00:00.000Z', flag: true });
  assert.equal(error, null, error?.message);
  const { data } = await db.from('widgets').select('*').eq('id', 4);
  assert.equal(data.length, 1);
  assert.equal(data[0].name, 'delta');
});

await check('update mutates only matching rows', async () => {
  const { error } = await db.from('widgets').update({ qty: 99 }).eq('id', 1);
  assert.equal(error, null, error?.message);
  const rows = stub.rowsOf('widgets');
  assert.equal(rows.find((r) => r.id === 1).qty, 99);
  assert.equal(rows.find((r) => r.id === 2).qty, 10, 'update touched a non-matching row');
});

await check('upsert merges on the primary key instead of duplicating', async () => {
  const { error } = await db.from('widgets').upsert({ id: 2, name: 'beta-updated' });
  assert.equal(error, null, error?.message);
  const rows = stub.rowsOf('widgets').filter((r) => r.id === 2);
  assert.equal(rows.length, 1, 'upsert duplicated the row');
  assert.equal(rows[0].name, 'beta-updated');
  assert.equal(rows[0].qty, 10, 'upsert dropped columns it was not given');
});

await check('rpc returns the seeded value', async () => {
  const { data, error } = await db.rpc('widget_summary');
  assert.equal(error, null, error?.message);
  assert.equal(data.total, 30);
});

await check('an unseeded rpc errors rather than returning null', async () => {
  const { error } = await db.rpc('no_such_function');
  assert.ok(error, 'an unseeded rpc resolved successfully');
  assert.equal(error.code, 'PGRST202');
});

await check('every request is recorded for later assertion', () => {
  assert.ok(stub.requests.length > 0);
  const paths = stub.requests.map((r) => r.table);
  assert.ok(paths.includes('widgets'));
  assert.ok(paths.includes('rpc:widget_summary'));
});

await stub.close();

if (process.exitCode) console.error(`\n${passed} passed, some failed`);
else console.log(`\n${passed} passed, 0 failed`);
