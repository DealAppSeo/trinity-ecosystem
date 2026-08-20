# Red team — trustshell.dev SOURCE pass, 2026-08-17

Follow-up to the live-surface campaign (`docs/RED-TEAM-TRUSTSHELL-DEV-2026-08-16.md`).
The user authorized attaching the source repo. Cloned `DealAppSeo/trustshell` at
**`6cfd2d3`** — the exact commit live on trustshell.dev (verified against the
Vercel production deployment `dpl_J53jTJ3cXf…`), so this review is of the deployed
code, not a drifted branch.

This was **read, not executed** — a source review. Where a claim needs the live
backend to confirm, it says so and is deferred to a named next campaign rather
than asserted.

---

## Executive summary

**Posture: the client's own code is clean, and in several places notably
well-built. The one confirmed defect is the disabled Supabase key already filed
as LIVE-002 — now source-confirmed and shown to extend to the server path. The
real remaining attack surface is `repid-engine`, which this source only *reveals*;
it is the next campaign, not a trustshell finding.**

What the review changed about the earlier picture: my first instinct on seeing
the bundle call `/api/v1/agents/{id}/score-event` from the browser was "open
reputation write." **Reading the full flow refuted that** — the call carries
`Authorization: Bearer <the agent's own issued key>`, and the run gate is enforced
server-side. That is the anchor discipline paying off in a source review: the
scary version did not survive the surrounding twenty lines.

**Headline**

1. **LIVE-002 (Medium) — confirmed at the source and extended.** `lib/supabase.ts`
   builds the browser client from `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the disabled
   legacy key), and the server helpers use `SUPABASE_SERVICE_ROLE_KEY` — if that
   env holds the legacy `service_role` JWT it is disabled too, so the
   governance-suggestion write and the `/market` + `/repid` reads 401 silently.
2. **TS-SRC-001 (Low) — session tokens in `localStorage`.** The agent API key
   (bearer to `score-event`), the 30-day gate JWT, and the account token live in
   plain `localStorage`; combined with the absent CSP (HDR-001), an XSS exfiltrates
   them. The devs acknowledge it in comments; the high-value secret (LLM keys) is
   correctly vaulted, so this is a deliberate, defensible split — noted, not alarmed.
3. **The repid-engine surface (next campaign, not trustshell).** The client wires
   the browser to `/api/v1/agents/register` (no auth), `/api/v1/llm/complete`
   (gated), and sends the user's own LLM keys to the backend on paid runs. None is
   a trustshell defect; all are repid-engine's to answer.

**What is genuinely well-built** (stated because a red team that only lists
faults miscalibrates the reader): the key vault, the input validation, and the
service-role query construction. Details below.

---

## Findings

### LIVE-002 (extended) — disabled Supabase key, now confirmed in source and on the server path

`lib/supabase.ts`:

```ts
export function createClient() {                       // browser
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)        // <- the legacy anon key (LIVE-002)
}
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;   // server
export function supabaseConfigured(): boolean {
  return Boolean(url && serviceRoleKey);               // presence, NOT validity
}
```

The browser path is the root cause of the bundle finding, now confirmed in
source: the shipped key is whatever Vercel sets for `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and the live test proved that value is a disabled legacy JWT.

**The extension:** `supabaseConfigured()` checks only that the key is *present*,
not that it *works*. So the server-side `submitSuggestion` (a `service_role`
insert into `repid_governance_suggestions`) and the `sbSelect` reads behind
`/market` and `/repid` will attempt the call and 401 **if** `SUPABASE_SERVICE_ROLE_KEY`
is the legacy `service_role` JWT — which was disabled on the same date. The user
sees "Could not save your suggestion" / an empty catalog, with the error swallowed
exactly as on aitrinitysymphony.

**What this does NOT establish.** The server env value is not observable from
here — the server key may already be a current `sb_secret_…`, in which case the
server path is fine and only the browser path is dead. The browser key being
legacy-disabled is confirmed; the server key is **NOT CHECKED**.

**Fix.** Same redeploy as LIVE-002, and set **both** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
→ `sb_publishable_…` and `SUPABASE_SERVICE_ROLE_KEY` → `sb_secret_…`. Consider
making `supabaseConfigured()` (or a startup check) probe validity, so a disabled
key is loud instead of a swallowed 401.

### TS-SRC-001 (Low) — bearer tokens in localStorage compound with the missing CSP

`lib/agent-gate.ts` and `lib/account.ts` store the gate JWT, the account token,
and (via `lib/db.ts`) the agent API key in `localStorage`. The agent API key is
the bearer that authenticates `score-event` — i.e. the credential that moves an
agent's RepID. `localStorage` is readable by any script on the origin, and
HDR-001 found **no CSP** on the surface, so a single injected script exfiltrates
every one of these.

**What this does NOT establish.** No XSS was found — this is the *impact* of one,
not a demonstration that one exists. And it is a conventional web tradeoff the
authors made deliberately (`account.ts` comment: *"Not [secure]… a bearer token"*).
The genuinely sensitive secret — the user's paid LLM keys — is **not** here; it is
in the encrypted vault. So the severity is Low: the split is defensible, and the
mitigation is HDR-001's (add a CSP), not a storage rewrite.

**Fix.** Add a CSP (closes HDR-001 and this at once). Optionally scope the agent
key's power so a stolen one cannot inflate RepID unboundedly — a repid-engine
question.

---

## What held — and is worth stating

- **The vault is correct.** `lib/vault.ts`: PBKDF2-**SHA-256, 250,000 iterations**,
  256-bit **AES-GCM**, a fresh 16-byte random salt per vault and a fresh 12-byte
  random IV per encryption, stored in IndexedDB; the passphrase derives the key
  and never leaves the device. This is how client-side key custody should look —
  authenticated encryption, per-item IV, a real KDF work factor.
- **Input validation on the one write.** `submitSuggestion` validates email and
  GitHub-handle by regex and caps the suggestion at 1000 chars before the
  `service_role` insert. The table name is a **hardcoded literal**, and the row is
  passed as a JSON body to PostgREST (parameterized) — no injection, no
  user-controlled table.
- **Service-role reads are not injectable.** Both `sbSelect` callers
  (`repid_governance_suggestions`, `agent_services`) pass **hardcoded**
  `table`/`select`/`orderBy`/`filter` with no `searchParams` or request input
  reaching them. The RLS-bypassing read cannot be redirected to another table.
- **score-event is authenticated.** The browser attaches
  `Authorization: Bearer <agent.apiKey>` — the key repid-engine issues once at
  registration. An agent scores *itself* with *its own* key; this is not an open
  write.
- **The run gate is server-enforced.** `verification_required` / `daily_cap` /
  `x-taste-remaining` come from repid-engine's `/api/v1/agent-gate/*`; the client
  only attaches the token. Dropping it client-side just drops you to the anonymous
  cap — no client-side bypass.
- **No committed secrets.** The only tracked env file, `.env.production`, contains
  one line: `NEXT_PUBLIC_REPID_ENGINE_URL=https://repid-engine-production.up.railway.app`
  — a public URL. No key, JWT, or private key is committed anywhere in the tree.

---

## The repid-engine surface this source reveals (NEXT CAMPAIGN — not trustshell)

The client is a well-behaved caller; these belong to `DealAppSeo/repid-engine`,
which is a separate repo (not attached) and Railway-hosted (proxy-denied here). I
did **not** probe them — doing so is a repid-engine engagement with its own scope,
and several are write endpoints. Recorded as hypotheses with the *safe* probe for
each:

1. **Open agent registration.** `POST /api/v1/agents/register` carries no auth and
   returns an `api_key`. So the "agent's own key" that gates `score-event` is
   **freely mintable** — the auth proves "an agent scoring itself," and anyone can
   be an agent. Whether that enables RepID inflation depends on whether the score
   is *self-asserted* or *HAL-verified* (next item). *Safe probe:* an unauth POST
   with an empty body — 401 = gated, 400/422 = open (reached validation, no agent
   created).
2. **Are score fields self-asserted?** The `score-event` body is built client-side:
   `certainty: 0.85`, `outcome: 'success'`, `decision_text`, `task_domain` — all
   from the browser. If repid-engine trusts `outcome`/`certainty`, a freely-minted
   agent inflates its own RepID at will. The trustshell comment claims supplying
   `prompt` "engages the cross-LLM agreement path" and HAL scores it independently
   — **if true, this is HELD**, and it is the whole thesis of the system. *This is
   the single highest-value question in the ecosystem* and it is a repid-engine
   source question.
3. **User LLM keys transit to the backend.** `/connect` and `/run` POST the user's
   raw provider key inside `user_paid_keys` to `/api/v1/llm/complete`. The privacy
   posture says keys are "used in memory, never stored, redacted from logs" — a
   claim only repid-engine's source/logs can confirm.
4. **x402 purchase gating.** `min_repid_to_purchase` is shown per service in the
   catalog; the purchase settles "x402 · on-chain USDC." Whether the min-RepID gate
   is enforced server-side / on-chain or only in the UI is a repid-engine + contract
   question.

---

## Coverage map

| item | status |
|---|---|
| Committed secrets across the tree | **CHECKED** — none (only a public URL) |
| `lib/supabase.ts` key usage (browser + server) | **CHECKED** — LIVE-002 confirmed + extended |
| `submitSuggestion` server action (validation, injection) | **CHECKED** — HELD |
| `sbSelect`/`sbInsert` for user-controlled table/filter | **CHECKED** — HELD (hardcoded) |
| Client key custody (vault) | **CHECKED** — HELD (AES-GCM, PBKDF2 250k) |
| Session token storage | **CHECKED** — localStorage (TS-SRC-001, Low) |
| score-event / llm/complete / gate auth (client side) | **CHECKED** — authenticated / gated |
| repid-engine endpoint behaviour | **NOT CHECKED** — separate repo, proxy-denied; next campaign |
| Post-hydration runtime behaviour | **NOT CHECKED** — source review only |
| Full chunk graph beyond the 6 entry chunks | **NOT CHECKED** (from LIVE-002) |

---

## Residual risk and next campaign

**trustshell.dev's own code is low-risk.** The confirmed defect is the disabled
key (LIVE-002), which fails closed; the localStorage tokens are a Low that the
CSP fix mostly closes. Nothing in the client is exploitable on its own.

**The next campaign is `repid-engine`**, and it is where the ecosystem's real
trust question lives: **is a RepID score self-asserted or HAL-verified?** Item 2
above decides whether open registration + client-built score fields is a
reputation-inflation break or a non-issue. That needs the repid-engine source
(attach `DealAppSeo/repid-engine`) and, for the live half, the safe auth-probes
listed — run against the backend with explicit scope, since they touch write
endpoints. Ask before starting: it is a new target.
