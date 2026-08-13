// embed-memory-backfill
//
// DEPLOYED to project qnnpjhlxljtqyigedwkb. This file is the source of record —
// keep it in sync, because a function that exists only in the dashboard is the
// drift this repo keeps re-learning.
//
// WHY. `graph_rag_match_nodes` filters on `embedding IS NOT NULL`. Measured
// 2026-08-13: of 429 memory nodes, 204 belong to `test-agent-v11` and carry 192
// of the 213 embeddings. The twelve production agents held 184 nodes with 9
// embeddings between them, and eight of the twelve had ZERO — for those eight,
// recall returned empty by construction, no matter what was asked. That is why
// Trinity's memory looked built and did nothing.
//
// WHY IT RUNS HERE. Inside the project the vectors never cross a network
// boundary or a model context. 175 vectors × 384 float32 is ~283 KB of raw
// float data; pushing that through an agent session would cost six figures of
// tokens to accomplish something Postgres and Deno can do next to each other.
//
// MODEL FIDELITY IS THE WHOLE RISK, and it is not theoretical:
//
//   repid-engine calls `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`
//   with no options, so transformers.js serves the QUANTIZED onnx export.
//   Embedding the remaining rows with the fp32 export instead produces vectors
//   ~0.994 cosine from the existing ones — measured, not guessed. Close enough
//   to look correct in a spot check, far enough to degrade every ranking that
//   compares them. So this function keeps the same default and PROVES it before
//   writing anything: it re-embeds a node whose vector is already stored and
//   refuses to proceed unless it reproduces it to >= 0.9999.
//
//   Observed on the real run: 0.9999999999999953.
//
// Three outcomes, never two. Every response is VERIFIED, PARTIAL or FAILED and
// names the stage it stopped at. A run that wrote nothing says so.
//
// Invocation (HTTP is unreachable from sandboxed agent sessions, so this is
// driven from SQL via pg_net; a pg_cron job `memory-embed-backfill-drain`
// calls it at 18/min and self-guards to a no-op once no targets remain):
//
//   select net.http_post(
//     url := '.../functions/v1/embed-memory-backfill',
//     body := '{"dry_run": false, "limit": 18}'::jsonb, ...);
//
// Batch size is capped low on purpose: limit=60 returns WORKER_RESOURCE_LIMIT.
// Partial progress is always durable — the target list is recomputed from
// `embedding IS NULL` on every call, so a killed run simply resumes.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

env.allowLocalModels = false;
env.useBrowserCache = false;

/** A node carrying a production-written vector. Re-embedding it must reproduce that vector. */
const GATE_NODE_ID = '0033c881-c0c4-4b34-9f83-57a9868261f9';
const GATE_MIN_COSINE = 0.9999;

function pickKey(): { key: string; name: string } | null {
  for (const n of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY', 'SERVICE_ROLE_KEY']) {
    const v = Deno.env.get(n);
    if (v && v.length > 20) return { key: v, name: n };
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

Deno.serve(async (req) => {
  const started = Date.now();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  const dryRun = body.dry_run !== false;   // writes nothing unless explicitly told to
  const limit = Math.min(Number(body.limit ?? 25), 200);

  const picked = pickKey();
  if (!picked) {
    return Response.json({ status: 'FAILED', stage: 'auth', detail: 'no usable service key in env' }, { status: 500 });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, picked.key);

  let extractor;
  try {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  } catch (e) {
    return Response.json({ status: 'FAILED', stage: 'model_load', key_env: picked.name, detail: String(e), elapsed_ms: Date.now() - started }, { status: 500 });
  }

  const embed = async (text: string): Promise<number[]> => {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data as Float32Array);
  };

  const { data: gateRows, error: gateErr } = await supabase
    .from('agent_memory_nodes').select('id, content, embedding').eq('id', GATE_NODE_ID).limit(1);

  if (gateErr || !gateRows?.length) {
    return Response.json({ status: 'FAILED', stage: 'gate_fetch', key_env: picked.name, detail: gateErr?.message ?? 'gate node not found' }, { status: 500 });
  }

  const raw = gateRows[0].embedding;
  const stored: number[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const mine = await embed(gateRows[0].content as string);

  if (!stored || stored.length !== mine.length) {
    return Response.json({ status: 'FAILED', stage: 'gate_dims', detail: `stored ${stored?.length} vs computed ${mine.length}` }, { status: 500 });
  }

  const gateCosine = cosine(mine, stored);
  if (gateCosine < GATE_MIN_COSINE) {
    // Refuse. A near-miss here is exactly the silent-degradation case.
    return Response.json({
      status: 'FAILED', stage: 'gate_cosine', gate_cosine: gateCosine, required: GATE_MIN_COSINE, wrote: 0,
      detail: 'runtime does not reproduce stored vectors; writing would mix embedding spaces',
      elapsed_ms: Date.now() - started,
    }, { status: 409 });
  }

  const { data: targets, error: selErr } = await supabase.rpc('memory_backfill_targets', { p_limit: limit });
  if (selErr) {
    return Response.json({ status: 'FAILED', stage: 'select', detail: selErr.message, gate_cosine: gateCosine }, { status: 500 });
  }
  const rows = (targets ?? []) as Array<{ id: string; content: string; agent_name: string }>;

  if (dryRun) {
    return Response.json({
      status: 'VERIFIED', mode: 'dry_run', wrote: 0, gate_cosine: gateCosine, gate_passed: true,
      key_env: picked.name, would_write: rows.length,
      sample: rows.slice(0, 3).map((r) => ({ id: r.id, agent: r.agent_name, chars: (r.content ?? '').length })),
      elapsed_ms: Date.now() - started,
    });
  }

  let wrote = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const r of rows) {
    try {
      const vec = await embed(r.content ?? '');
      const { error: upErr } = await supabase.from('agent_memory_nodes')
        .update({ embedding: JSON.stringify(vec) }).eq('id', r.id);
      if (upErr) failures.push({ id: r.id, error: upErr.message }); else wrote++;
    } catch (e) {
      failures.push({ id: r.id, error: String(e) });
    }
  }

  return Response.json({
    status: failures.length === 0 ? 'VERIFIED' : 'PARTIAL',
    mode: 'write', wrote, attempted: rows.length, failed: failures.length,
    failures: failures.slice(0, 5), gate_cosine: gateCosine, gate_passed: true,
    elapsed_ms: Date.now() - started,
  });
});
