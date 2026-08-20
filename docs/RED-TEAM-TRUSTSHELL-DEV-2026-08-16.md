# Red team campaign — trustshell.dev, 2026-08-16

Constructive campaign against the live `trustshell.dev` surface, run under
`.claude/skills/trust-red-team`. Keyless, read-only, non-exploitative — every
request was a GET via Supabase `pg_net` (the domain is `curl`/browser
proxy-denied from an agent session). Raw evidence in
`scripts/redteam/evidence/{recon,bundle}-trustshell-dev.json`.

---

## Executive summary

**Posture: small external surface, one real finding — and it is a repeat.**

`trustshell.dev` is a 126 KB Next.js landing page (Vercel `trustshell-landing`,
repo `DealAppSeo/trustshell`). It exposes no API routes, sets no cookies, leaks
no credential in its SSR document, and ships no source maps — a genuinely thin
outside surface. The one finding is in the **client bundle**: it is wired to
Supabase with a **legacy `anon` key that the project disabled on 2026-08-04**,
confirmed dead by a live auth test (401). Nothing leaks — but any Supabase-backed
feature on the page is silently broken, which is the **exact root cause of the
217-day-dead aitrinitysymphony lead form**, now on a second surface.

**Headline findings**

1. **LIVE-002 (Medium)** — bundle ships a disabled legacy `anon` Supabase key;
   any client Supabase call 401s.
2. **HDR-001 (Low)** — no CSP / `X-Frame-Options` / `nosniff` / Referrer /
   Permissions header on the root document (HSTS is set). Carried from the Strix
   recon; a lead for a browser agent to confirm, not a closed finding.

**Immediate actions**

- Redeploy `DealAppSeo/trustshell` with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  set to a current `sb_publishable_…` key. Sean-gated (repo not attached here).
- Decide whether the missing security headers are worth a Vercel config add.

**Not covered here** (and why): the application **source** —
`DealAppSeo/trustshell` is not attached to this session; **post-hydration
behaviour** — not observable from `pg_net`; **the browser→repid-engine call
path** the bundle contains — needs the source or a browser. All three are the
next campaign.

---

## Findings

### LIVE-002 — Client bundle ships a disabled legacy Supabase key

| | |
|---|---|
| **Component** | trustshell.dev / client bundle |
| **Severity** | Medium |
| **Status** | Open, ledgered, owner **Sean**, review by 2026-09-15 |

**Description.** The SSR document is clean, but `NEXT_PUBLIC_*` Supabase config
is inlined into the JS bundle, not the HTML. Across the 6 entry chunks (742 KB)
the bundle embeds the project URL `qnnpjhlxljtqyigedwkb.supabase.co` and a
Supabase key. Decoding the key's JWT claims: `{iss: supabase, ref:
qnnpjhlxljtqyigedwkb, role: anon}` — a **legacy** anon JWT, not a new
`sb_publishable_…` key. `CLAUDE.md` records that legacy keys are disabled
project-wide; this campaign **confirmed it live** rather than assuming it.

**Evidence.**

```
bundle: 6 entry chunks, 741,641 bytes
  backend hosts embedded:
    https://qnnpjhlxljtqyigedwkb.supabase.co
    https://repid-engine-production.up.railway.app
  supabase key: legacy JWT, claims {iss:supabase, ref:qnnpjhlxljtqyigedwkb, role:anon}
  new sb_publishable/sb_secret key: none

live auth test (pg_net GET https://qnnpjhlxljtqyigedwkb.supabase.co/rest/v1/,
                apikey = the embedded token):
  HTTP 401
  {"message":"Legacy API keys are disabled",
   "hint":"…disabled on 2026-08-04T05:44:42Z … use the new publishable and secret API keys."}
```

The `service_role` string also appears in the bundle — it is supabase-js library
boilerplate (alongside auth-event names `PASSWORD_RECOVERY`, `TOKEN_REFRESHED`),
**not** a second key. Only one JWT is embedded, and it is `anon`.

**What this does NOT establish.** (1) It is **not a credential leak** — an `anon`
key is public by design, and this one is disabled, so it grants nothing;
confidentiality impact is nil. (2) Whether trustshell.dev actually **calls**
Supabase at runtime is **post-hydration behaviour, NOT CHECKED** from an agent
session — if the client constructs a Supabase client but never calls it, this is
Informational. (3) Only the **6 entry chunks** were fetched; a key in a lazily
loaded route chunk was not searched — but Supabase config normally lives in a
shared init chunk, which is where this was found.

**Impact.** Fails **closed** — the safe direction. No data flows, nothing is
forged. The cost is **availability**: every Supabase call the client makes
returns 401, so any feature behind it (auth, lead capture, data reads) is
silently broken, with the error swallowed client-side exactly as it was on
aitrinitysymphony.com, where the same root cause hid a dead lead form for 217
days.

**Recommended fix.** Redeploy `DealAppSeo/trustshell` with
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to a current `sb_publishable_…` key
(maps to the `anon` role; the standard browser key). One env var + a build.
Sean-gated: the repo is not attached to this session.

**Re-test.** Re-collect `scripts/redteam/evidence/bundle-trustshell-dev.json`
after redeploy; `npm run check:redteam -- --probe LIVE-002`. HELD once the shipped
key is a current publishable key whose live auth test is 200.

---

### HDR-001 — Thin response-header security posture (Low)

Carried from `docs/RED-TEAM-STRIX-TRUSTSHELL-2026-08-16.md`; re-confirmed. Root
document ships `Strict-Transport-Security: max-age=63072000` and **none** of
CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`.

**What this does NOT establish.** Root document only, one egress path; a
middleware header on other routes or a `<meta>` CSP would not appear, and
post-hydration behaviour is not checkable here. It is a **lead for a browser
agent (Strix)** to confirm framing/sniffing dynamically, not a closed finding.

**Fix.** If confirmed, a small Vercel config / `next.config` header block.

---

## What held / came back clean

Keyless recon, all via `pg_net`:

| check | result |
|---|---|
| `/robots.txt`, `/sitemap.xml` | 404 — absent (no info disclosure) |
| `/api/health`, `/api/waitlist`, `/api/leads` | 404 — no such API routes on this surface |
| `/.env` | 404 — not served |
| SSR document | no `supabase`, no key, no JWT, no `service_role`, no `/api/` refs, **no source maps** |
| Set-Cookie on root | none — no session/tracking cookie set server-side |
| HSTS | present, 2-year max-age ✓ |

---

## Coverage map

| item | status |
|---|---|
| Endpoint / well-known-path enumeration | **CHECKED** via pg_net — no API routes found |
| SSR credential / source-map leak | **CHECKED** — clean |
| Client-bundle Supabase key (entry chunks) | **CHECKED** — legacy anon, disabled (LIVE-002) |
| Client-bundle key in lazy route chunks | **NOT CHECKED** — only 6 entry chunks fetched |
| Response-header posture | **CHECKED** — HSTS only (HDR-001) |
| Post-hydration behaviour / does it call Supabase | **NOT CHECKED** — not observable from pg_net |
| Browser → repid-engine call path (embedded in bundle) | **NOT CHECKED** — needs source or a browser |
| Application source (`DealAppSeo/trustshell`) | **NOT ATTEMPTED** — repo not attached to this session |
| Dynamic / exploit / auth-flow testing | **NOT ATTEMPTED** — that is Strix's job (`scripts/redteam/tools/strix.md`) |

---

## Residual risk and next campaign

**Residual risk: low on what was reachable, unknown on what was not.** The
outside of trustshell.dev is thin and mostly clean; the one finding fails closed.
The real unexamined surface is the **application source** and the
**browser→repid-engine path** the bundle revealed — a landing page that ships a
direct client to the trust backend is worth a source pass.

**Next campaign, in order:**

1. **Attach `DealAppSeo/trustshell` and run a source campaign** — the route
   handlers, the Supabase client construction, and especially how the browser is
   wired to `repid-engine-production.up.railway.app`. Ask before adding the repo.
2. **Strix against the deployment** (`scripts/redteam/tools/strix.md`) — confirms
   HDR-001 dynamically and exercises the client-side paths pg_net cannot.
3. **repid-engine's browser-reachable endpoints** — if the trustshell client
   calls it unauthenticated, which endpoints answer? Needs the source or a
   browser; repid-engine is proxy-denied here.
