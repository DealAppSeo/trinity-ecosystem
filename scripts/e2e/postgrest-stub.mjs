#!/usr/bin/env node
//
// postgrest-stub.mjs — an in-memory PostgREST, good enough to run the real app.
//
// WHY THIS EXISTS, rather than mocking the Supabase client.
//
// The sandbox proxy denies qnnpjhlxljtqyigedwkb.supabase.co (CLAUDE.md,
// "Network, in cloud/remote sessions"), so an E2E run cannot reach the real
// database from here. The tempting alternative — stubbing `getSupabaseAdmin()`
// — replaces the thing most likely to be wrong. Route handlers build queries
// through supabase-js; a hand-written mock accepts whatever chain you wrote,
// including one PostgREST would reject.
//
// So the seam is moved down to the wire: point NEXT_PUBLIC_SUPABASE_URL at this
// server and every layer above it is the real one — real handler, real
// supabase-js, real HTTP, real query string. Only the database is fake.
//
// TWO BEHAVIOURS THAT ARE DELIBERATE, NOT SHORTCUTS:
//
//   1. An unseeded table returns HTTP 404 with a PostgREST-shaped error, and is
//      recorded. It does NOT return []. An empty array is indistinguishable
//      from "this table has no matching rows", which would let a route that
//      queries the wrong table pass silently — the exact defect class this repo
//      keeps logging (CLAUDE.md, "How to be right here").
//   2. `.single()` on a row count other than 1 returns 406/PGRST116, as
//      PostgREST does. `.maybeSingle()` is reduced client-side by postgrest-js
//      (verified against postgrest-js 2.112.0: `single()` sets the object Accept
//      header, `maybeSingle()` only sets a flag), so this server returns an
//      array for it and lets the client collapse it.
//
// Supported: select/eq/neq/gt/gte/lt/lte/in/is, order, limit, offset, column
// projection, insert, update, upsert, and rpc. That is the full set the routes
// under test use — enumerated with `grep -rhoE "\.from\('[a-z_]+'\)" lib app`,
// not guessed.

import http from 'node:http';

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/** PostgREST-shaped error body. */
function pgError(code, message, details = null, hint = null) {
  return { code, message, details, hint };
}

/**
 * Compare a stored value against the string PostgREST would have received.
 * Timestamps are ISO-8601 UTC, so lexicographic order is chronological order —
 * which is why `gte` on `observed_at` works without parsing dates.
 */
function coerce(stored, raw) {
  if (typeof stored === 'number') return [stored, Number(raw)];
  if (typeof stored === 'boolean') return [stored, raw === 'true'];
  return [stored, raw];
}

function applyFilter(row, column, expr) {
  const dot = expr.indexOf('.');
  const op = dot === -1 ? 'eq' : expr.slice(0, dot);
  const raw = dot === -1 ? expr : expr.slice(dot + 1);
  const stored = row[column];

  switch (op) {
    case 'is':
      if (raw === 'null') return stored === null || stored === undefined;
      if (raw === 'true') return stored === true;
      if (raw === 'false') return stored === false;
      return false;
    case 'in': {
      const list = raw.replace(/^\(/, '').replace(/\)$/, '').split(',')
        .map((s) => s.replace(/^"(.*)"$/, '$1'));
      return list.some((item) => {
        const [a, b] = coerce(stored, item);
        return a === b;
      });
    }
    default: {
      const [a, b] = coerce(stored, raw);
      switch (op) {
        case 'eq':  return a === b;
        case 'neq': return a !== b;
        case 'gt':  return a > b;
        case 'gte': return a >= b;
        case 'lt':  return a < b;
        case 'lte': return a <= b;
        default:    return false;
      }
    }
  }
}

function project(row, select) {
  if (!select || select === '*') return { ...row };
  const cols = select.split(',').map((c) => c.trim()).filter(Boolean);
  if (cols.includes('*')) return { ...row };
  const out = {};
  for (const col of cols) out[col] = row[col] ?? null;
  return out;
}

function sortRows(rows, order) {
  if (!order) return rows;
  const clauses = order.split(',').map((c) => c.trim()).filter(Boolean);
  return [...rows].sort((x, y) => {
    for (const clause of clauses) {
      const [col, ...mods] = clause.split('.');
      const desc = mods.includes('desc');
      const a = x[col];
      const b = y[col];
      if (a === b) continue;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      const cmp = a < b ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {Record<string, object[]>} opts.tables  seeded rows, keyed by table name
 * @param {Record<string, unknown>}  opts.rpc     rpc name -> value or (body) => value
 * @param {Record<string, string>}   opts.primaryKeys  table -> column used for upsert merge
 */
export function createPostgrestStub({ tables = {}, rpc = {}, primaryKeys = {} } = {}) {
  /** Every request, so a test can assert what the route actually asked for. */
  const requests = [];
  /** Tables the app queried that were never seeded — always a test-authoring bug. */
  const unseeded = new Set();
  const db = new Map(Object.entries(tables).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, body, extraHeaders = {}) => {
      const payload = body === null ? '' : JSON.stringify(body);
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-range': '*/*',
        ...extraHeaders,
      });
      res.end(payload);
    };

    const body = await readBody(req);
    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    const tableMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);

    requests.push({
      method: req.method,
      path: url.pathname,
      query: url.search,
      table: rpcMatch ? `rpc:${rpcMatch[1]}` : tableMatch?.[1] ?? null,
      body,
    });

    if (rpcMatch) {
      const name = rpcMatch[1];
      if (!(name in rpc)) {
        unseeded.add(`rpc:${name}`);
        return send(404, pgError('PGRST202', `Could not find the function public.${name}`,
          'postgrest-stub: no rpc seeded under this name'));
      }
      const value = typeof rpc[name] === 'function' ? await rpc[name](body) : rpc[name];
      return send(200, value);
    }

    if (!tableMatch) return send(404, pgError('PGRST000', `no route for ${url.pathname}`));

    const table = tableMatch[1];
    if (!db.has(table)) {
      unseeded.add(table);
      // Loud on purpose — see header note 1.
      return send(404, pgError(
        'PGRST205',
        `Could not find the table 'public.${table}' in the schema cache`,
        'postgrest-stub: table not seeded for this scenario',
        'Add it to the scenario seed so the assertion tests real data, not an empty result.',
      ));
    }

    const rows = db.get(table);
    const select = url.searchParams.get('select');
    const wantsObject = (req.headers['accept'] ?? '').includes('application/vnd.pgrst.object+json');
    const prefer = String(req.headers['prefer'] ?? '');
    const wantsRepresentation = prefer.includes('return=representation');

    const filters = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (!RESERVED.has(key)) filters.push([key, value]);
    }
    const matches = (row) => filters.every(([col, expr]) => applyFilter(row, col, expr));

    if (req.method === 'GET' || req.method === 'HEAD') {
      let out = rows.filter(matches);
      out = sortRows(out, url.searchParams.get('order'));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = url.searchParams.get('limit');
      out = out.slice(offset, limit === null ? undefined : offset + Number(limit));
      const projected = out.map((r) => project(r, select));

      if (wantsObject) {
        if (projected.length !== 1) {
          return send(406, pgError(
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned',
            `Results contain ${projected.length} rows, application/vnd.pgrst.object+json requires 1 row`,
          ));
        }
        return send(200, projected[0]);
      }
      return send(200, projected);
    }

    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body];
      const merge = prefer.includes('resolution=merge-duplicates');
      const pk = url.searchParams.get('on_conflict') ?? primaryKeys[table] ?? 'id';
      const written = [];
      for (const record of incoming) {
        const row = { ...record };
        if (merge) {
          const idx = rows.findIndex((r) => r[pk] !== undefined && r[pk] === row[pk]);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...row };
            written.push(rows[idx]);
            continue;
          }
        }
        rows.push(row);
        written.push(row);
      }
      if (!wantsRepresentation) return send(201, null);
      const projected = written.map((r) => project(r, select));
      if (wantsObject) {
        if (projected.length !== 1) {
          return send(406, pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned'));
        }
        return send(201, projected[0]);
      }
      return send(201, projected);
    }

    if (req.method === 'PATCH') {
      const touched = [];
      for (let i = 0; i < rows.length; i++) {
        if (!matches(rows[i])) continue;
        rows[i] = { ...rows[i], ...body };
        touched.push(rows[i]);
      }
      if (!wantsRepresentation) return send(204, null);
      return send(200, touched.map((r) => project(r, select)));
    }

    if (req.method === 'DELETE') {
      const kept = [];
      const removed = [];
      for (const row of rows) (matches(row) ? removed : kept).push(row);
      db.set(table, kept);
      if (!wantsRepresentation) return send(204, null);
      return send(200, removed.map((r) => project(r, select)));
    }

    return send(405, pgError('PGRST000', `method ${req.method} not supported by stub`));
  });

  return {
    server,
    requests,
    /** Tables/rpcs the app asked for that no scenario seeded. */
    unseeded,
    rowsOf: (table) => (db.get(table) ?? []).map((r) => ({ ...r })),
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address();
          resolve(`http://127.0.0.1:${port}`);
        });
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
