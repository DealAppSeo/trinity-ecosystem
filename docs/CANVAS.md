# `/canvas` — tldraw, what it does today and what it deliberately does not

**Status:** tldraw 5.3.2 installed and rendering at `/canvas`. **Nothing is saved.** Agents
cannot reach it at all. Both of those are stated here because the editor looks complete on
screen, and an editor that appears to save and does not is worse than one that plainly doesn't.

## What is built

| | |
|---|---|
| Route | `/canvas` (static shell, client-only editor) |
| Package | `tldraw@5.3.2` |
| Import | `import { Tldraw } from 'tldraw'` · `import 'tldraw/tldraw.css'` |
| React | peer range `^18.2.0 \|\| ^19.2.1`; this repo runs 19.2.8 |

**Everything above was read out of the installed package, not from documentation.**
`tldraw.dev` is blocked by this environment's egress proxy, so the component signature came from
the shipped types (`export declare function Tldraw(props: TldrawProps): JSX.Element`) and the CSS
path from the package's own `exports` map. That is the better source anyway: it describes the
version actually on disk.

## Why it is loaded dynamically with `ssr: false`

Two independent reasons, and the second is the expensive one:

1. tldraw measures against the DOM. Server-rendering it produces markup the client discards.
2. **This repo builds the TrustRails dashboard from the same Next app.** A static import would
   place tldraw in a chunk a customer-facing route could pull in.

**MEASURED after a production build**, rather than assumed: tldraw compiles into exactly **one
1.7 MB client chunk**, and **zero** of the 6 shared/root entry files contain it. Re-check with a
build plus a grep for `tldraw` across `.next/static/chunks`; a second chunk appearing, or any hit
inside `build-manifest.json`'s `rootMainFiles`, means the split has regressed.

## What is NOT built, and what each piece actually needs

### Persistence — nothing survives a reload

tldraw **v4** had a one-prop `persistenceKey` that wrote to browser local storage. It is **gone in
v5** — it is absent from the installed type definitions, so writing it would have compiled to a
prop that is silently ignored: an editor that looks like it saves and does not. It was checked and
rejected for that reason, not overlooked.

v5 persists through the store. `TLStoreSnapshot` and `TLEditorSnapshot` are exported, so the shape
exists; wiring it is real work, not a prop.

### "Agents and people diagramming across projects" — the harder half

The requirement is that **agents** create and edit diagrams too, and that is not the same problem
as saving:

- **An agent cannot reach a browser's local storage.** Any client-side-only persistence solves the
  human half and structurally excludes the agent half. So the store has to be server-side from the
  start — choosing local storage now would have to be undone.
- A **document identity** is needed before "multiple projects" means anything: a project scope, a
  document id, and a rule for who may write to which.
- An **agent-facing API** — read a snapshot, write a snapshot — is what actually makes an agent a
  participant. Without it, "agents can diagram" is a UI with no door.
- **Concurrent edits** are a separate decision again. Two writers on one document without a merge
  story means last-write-wins and silent data loss. tldraw's own hosted sync service is paid,
  which cuts against the cost reduction this repo is currently doing; self-hosted sync is a
  service to run, which is the same problem in a different shape.

**Recommended order:** server-side snapshot store keyed by project + document → agent read/write
API → the editor loads and saves through that same API (so people and agents share one path, not
two) → only then decide whether concurrency is worth a sync backend.

**Not started.** No table, no API, no schema. Stated as absent rather than sketched, so nobody
reads a plan as a description.

## Cost

Adds no service and no vendor account: it is a page in an app that already deploys. The 1.7 MB is
paid only by someone who opens `/canvas`.
