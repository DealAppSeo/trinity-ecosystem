# Context budget — where an agent's tokens actually go

Measured, on this repo, from a real session's transcripts. Reproduce with:

```bash
npm run setup:context   # once
npm run mem:audit       # headroom audit-reads
npm run graph           # graphify update .
```

Headroom's own guidance is *"run this on a deployment's transcripts BEFORE
tuning compression defaults — opportunity sizes vary heavily by workload."*
This page is that run. Treat the numbers as a snapshot of one workload, not a
constant.

---

## The measurement (2026-08-12, 1 session)

Tool-result bytes, by tool:

| Tool | Bytes | ~Tokens | Share |
| :-- | --: | --: | --: |
| `Bash` | 574 KB | 143 K | 38.0% |
| `mcp__github__pull_request_read` | 249 KB | 62 K | 16.5% |
| `mcp__Supabase__execute_sql` | 197 KB | 49 K | 13.1% |
| `mcp__github__actions_list` | 111 KB | 27 K | 7.4% |
| `Read` | 81 KB | 20 K | **5.4%** |
| `mcp__github__get_job_logs` | 58 KB | 14 K | 3.8% |
| `mcp__Vercel__list_deployments` | 48 KB | 12 K | 3.2% |
| remaining MCP calls | 55 KB | 13 K | 3.6% |

**Structured MCP results total ~48%. File reads are 5.4%.**

That ordering is the whole finding, and it is the opposite of the intuition
that an agent's context is mostly source code. Optimising `Read` here would
address a twentieth of the problem. The JSON boundary is the problem.

## What each tool is for

**Headroom — the JSON boundary.** Compression measured on this repo's own
content, via `compress(messages, compress_user_messages=True, target_ratio=0.5)`:

| Sample | Before | After | Reduction |
| :-- | --: | --: | --: |
| `package-lock.json` | 124,853 tok | 11,055 tok | **91.1%** |
| Supabase docs blob (stored as `.txt`) | 21,657 tok | 21,657 tok | 0.0% |
| `lib/trust/BFTEngine.ts` | 4,651 tok | 4,651 tok | 0.0% |
| `LESSONS.md` | 2,723 tok | 2,723 tok | 0.0% |

Structured data compresses enormously; prose and source do not compress at all
under these settings. So Headroom is worth wiring **at the tool-result
boundary and nowhere else**. Pointing it at source files would spend latency
for nothing.

Note the third row. That file *is* JSON — it is the saved output of a Supabase
docs query — but it is stored with a `.txt` extension and got 0%. Content
routing is doing something extension-sensitive. **Unresolved**; it matters
because MCP results arriving as text/plain may be missing the win they should
get. Worth confirming before trusting the 48% figure as fully addressable.

**Graphify — the Read boundary, and navigation.** Builds a queryable graph so
"what calls `authorizePayment`" costs a query instead of a grep plus three file
reads. Graph at the time of writing: **883 nodes, 1,131 edges, 93 communities**
across 129 source files including `supabase/migrations/`. Expect that to move
with every commit — it is an index of the code, not a fact about it.

Its value here is less the 5.4% and more that `Read` had a **59.4% stale rate**
(23 calls where the file was edited after being read). A graph query answers
structural questions without pulling a file body into context at all.

## Two traps, both hit during setup

**1. Headroom returned the input unchanged and reported success.** Calling
`compress()` with a raw string instead of a message list produces a logged
warning, an unmodified return value, and no exception. The only tell was a
*negative* compression ratio — the wrapper had added bytes. A caller checking
"did it throw?" would record a pass. This is the failure mode `LESSONS.md`
exists for; verify by comparing token counts, not by exit code.

**2. `uv tool install` and `pip install` are different environments.**
`pip install "graphifyy[sql]"` does not give the `uv`-installed `graphify`
binary its SQL grammar — the binary lives in its own venv. The symptom is a
warning that all seven `.sql` files "contributed nothing", and an exit code of
**0**. Fix: `uv tool install --force "graphifyy[sql]"`. Adding the grammar took
the graph from 853 to 871 nodes.

## Known false positive

Graphify reports a syntax error in `lib/trustshell/index.ts` at line 12. The
line is `export type * from './types';` — valid TypeScript since 5.0. It is a
`tree-sitter-typescript` limitation, not a defect in the file. Left documented
rather than "fixed", because the tempting fix is to rewrite correct code to
appease a parser.

## Not done

`headroom init claude` installs durable hooks and routes the agent's provider
traffic through a local compressing proxy. **Not run here.** It rewrites
provider routing for the running process, which is unsafe inside a live agent
session, and this container is ephemeral so it would not persist. Run it on the
machine that hosts the agent.
