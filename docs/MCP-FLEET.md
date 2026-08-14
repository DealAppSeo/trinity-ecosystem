# Fleet discovery over MCP — `POST /api/mcp/fleet`

A prototype port of the discovery half of [kyegomez/swarms]'s AOP
(`swarms/structs/aop.py`, Apache-2.0): expose the agent fleet over the Model
Context Protocol so agents can find each other at runtime instead of being
wired to each other statically.

Ours reads `agent_node_registry`, so discovery survives a restart and is shared
across surfaces. Theirs reads an in-process dict, so it does not.

[kyegomez/swarms]: https://github.com/kyegomez/swarms

---

## Status: prototype, and the registry is empty

**`agent_node_registry` has zero rows, and nothing else in this repo writes to
it** (verified 2026-08-13). The table and `v_node_truth` were added by
migrations `20260810065905` / `20260810070023` and have had no producer since.

That is why `register_node` and `heartbeat_node` exist here. A discovery server
over a table nobody populates is decorative, and shipping one would reproduce
the exact defect this port was written to avoid — see "What we refused" below.

Until a real node registers, every read tool answers
`verification.status = "NOT_CHECKED"`, not an empty list.

---

## What this is for

| tool | principal | what it answers |
|---|---|---|
| `discover_agents` | user, service | Which nodes can take work right now, filtered by lane / surface / capability |
| `get_agent_details` | user, service | Everything known about one node, with the evidence behind its status |
| `fleet_health` | user, service | Counts by liveness status; capability totals across dispatchable nodes |
| `register_node` | **service only** | Upsert a node and start its lease |
| `heartbeat_node` | **service only** | Renew heartbeat and extend the lease |

Write tools are hidden from `tools/list` for the user principal, but calling one
anyway returns an actionable permission error rather than "unknown tool" — a
service caller that forgot its header should not be sent hunting for a typo.

## Auth

Both principals from `lib/auth.ts`:

- `Authorization: Bearer <supabase access token>` — a user session.
- `x-internal-secret: <INTERNAL_ROUTE_SECRET>` — server-to-server. Required for
  the write tools.

Unlike `/api/version`, this endpoint is **authenticated**. A commit SHA is not a
secret; the fleet's node ids, regions, models, branches and capability flags
together describe where the work runs and what it can do.

`MCP_ALLOWED_ORIGINS` (comma-separated) allowlists browser origins. Anything
else with an `Origin` header gets 403. A missing `Origin` is allowed, because
non-browser clients — the intended callers — do not send one. The Streamable
HTTP spec calls this out specifically: an MCP endpoint holding a service key is
a DNS-rebinding target if it does not check.

## Wire format

MCP Streamable HTTP, JSON responses only — no SSE. Every tool answers in one
shot, so a stream would add a connection lifecycle with nothing to put on it.
`GET` returns 405 (that is the spec's way of saying "no server-initiated
stream"), notifications get 202 with an empty body, and batches are rejected
with an explanation since they left the spec in 2025-06-18.

Protocol version is negotiated by echoing the client's when we speak it
(`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`) and answering with our
preferred one otherwise.

```bash
curl -sX POST https://app.aitrinitysymphony.com/api/mcp/fleet \
  -H 'content-type: application/json' \
  -H "x-internal-secret: $INTERNAL_ROUTE_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"discover_agents","arguments":{"lane":"hal"}}}'
```

---

## Liveness: tri-state, and why

**`is_live` is `true` or `null`. It is never `false`.**

We have no death signal, only the absence of a life signal, and those are
different facts. This mirrors `v_fleet_truth`, written deliberately to return
NULL rather than false when no signal exists (migration `20260811170821`,
`v_fleet_truth_never_asserts_dead_from_silence`).

Note that **`v_node_truth` does not do this** — its `is_live` is a plain
`heartbeat_at > now() - 10min`, which reports `false` for a node nobody has
asked about. This server computes liveness itself rather than trusting that
column. Worth reconciling in the view later.

Three fields, deliberately separate:

| field | kind | meaning |
|---|---|---|
| `is_live` | belief | `true` if a heartbeat landed inside the window, else `null` |
| `dispatchable` | decision | safe to route work here *right now* |
| `evidence` | basis | which signal, how old, and what it does and does not prove |

Collapsing belief into decision is how "we did not look" becomes "it passed".

Statuses:

- `live` — heartbeat inside 10 min, lease active. Dispatchable.
- `lease_active_no_recent_heartbeat` — lease valid, heartbeat stale. Liveness
  **unknown**. Withheld from dispatch because we cannot confirm it, not because
  we know it is down.
- `lease_expired` — lease lapsed. Not dispatchable. Still not proof it is down:
  a crash and a clean shutdown stop renewing identically.

An expired lease beats a fresh heartbeat — a node heartbeating into a dead
lease is misconfigured, not available.

### An empty registry is not an empty fleet

`discover_agents` on zero rows returns `registry_populated: false` and
`verification.status: "NOT_CHECKED"`, never a bare `[]`. And a database that
cannot be reached returns a JSON-RPC `-32603`, never an empty fleet. Both are
asserted in the smoke test; the second is also confirmed over HTTP.

---

## What we refused, and why it is the point

The upstream AOP was read closely on 2026-08-13. Three findings shaped this
port:

1. **`Task.correct_answer` is threaded through ~20 call sites** — the dataclass,
   the queue, `_process_task`, `Agent.run`, the model-fallback recursion, and
   the MCP tool schema advertised to external callers — **and is compared to
   nothing.** The only `if correct_answer:` in the codebase is a debug log
   reading `"Using correct answer for validation: ..."`. `_process_task` marks
   the task `COMPLETED` without looking at it.

2. **`agent_judge.get_reward()` scores by substring match** on "correct",
   "good", "excellent", "perfect", applied to the whole conversation. Executed:
   `"This is NOT correct."` → `1`. `"The answer is incorrect."` → `1`.
   `"The response is accurate, well-sourced and verifiable."` → `0`.

3. **No agent ever earns anything.** A repo-wide search for
   `track_record|performance_history|calibration|reliability_score` returns one
   file, and it is a prompt. Self-reported bid confidence is never reconciled
   against outcomes.

These are the same failure this codebase keeps logging: a system reporting
success it has not earned. So this port keeps AOP's shape — runtime discovery,
capability advertisement, MCP as the transport — and refuses its epistemics.

## Running the checks

```bash
npm run check:mcp-fleet     # 35 assertions, no network, no DB, no credentials
```

The rules worth having are the ones that are hard to reach through HTTP: the
window boundary, an expired lease under a fresh heartbeat, clock skew, a
zero-row UPDATE, an unpopulated registry. The smoke test drives
`deriveNodeView` and `handleRpc` directly against a stub source with a fixed
clock, so all of them are exercised in about a second.

It compiles `lib/mcp/` through a generated tsconfig that extends the repo's, so
it type-checks under the same `strict` settings the build uses. That first run
earned its keep: it caught `instanceof ToolInputError` returning false, because
`tsconfig.json` sets no `target`, tsc downlevels to ES5, and subclassing a
built-in silently breaks the prototype chain. Bad tool input was being reported
as an internal server error. Fixed with an explicit `Object.setPrototypeOf`.

### Verified on 2026-08-13

- `npm run check:mcp-fleet` — 35 passed, 0 failed.
- `npx tsc --noEmit` — 25 errors, unchanged from baseline; none in `lib/mcp/`
  or `app/api/mcp/`.
- `npx next build` — clean; `/api/mcp/fleet` registers as a dynamic route.
- Twelve transport checks over real HTTP against `next start`: 405 on GET with
  `Allow: POST`; 401 unauthenticated; 401 on a wrong secret; 403 cross-origin;
  200 with negotiated `protocolVersion` and `mcp-protocol-version` header; 202
  with empty body on a notification; `-32700` / `-32600` / `-32601` / `-32602`
  on malformed input; and an unreachable database surfacing as `-32603` rather
  than an empty fleet.
- The exact column list the route selects, run against the real
  `agent_node_registry` — 0 rows, no error.

**NOT CHECKED:** behaviour against a populated registry, since none exists yet,
and the deployed endpoint, which needs this branch merged first.

## Next

- A node that actually registers. Until then this serves `NOT_CHECKED` forever.
- Reconcile `v_node_truth.is_live` with the tri-state rule.
- The half of AOP not ported: per-agent task queues with priority and
  pause/resume. Worth having once nodes exist to dispatch to.
- Bid-based allocation (`swarms/structs/auction_swarm.py`) is the natural
  follow-on and maps onto the `a2a_negotiation` rfq/bid/award tables — but score
  bids by **earned RepID**, not the self-reported confidence upstream uses.
  Self-report is the thing RepID exists to replace.
