# Satellite repo secret sweep — 18 public repos, 2026-08-16

**Result: no new credential exposure.** The only usable-in-history finding is
the one already SETTLED in `CLAUDE.md` and needs no action. Everything else that
tripped the scanner is a **publicly known test key**, correctly flagged.

Scope: every public repo in the account plausibly running HAL, RepID, zkRepID or
TrustShell. Private repos could not be reached and are listed as NOT CHECKED in
§4 — that is a gap, not a clean result.

---

## 1. Method, and the trap it was built to avoid

Each repo was cloned **full** (no `--depth`), and every clone was checked with
`git rev-parse --is-shallow-repository` **before** scanning. A repo that came
back shallow would have been refused rather than scanned.

That guard is not hypothetical. From the OPEN list: the first `trustrails-dev`
scan *"reported a clean history it never read"* because the clone was a shallow
5 commits, and `--history` dutifully reported 0 usable. A scanner pointed at a
truncated history produces the house defect — success reported for work not
done — and it is invisible unless you check for it. Every row below carries its
commit count so the reader can see the scan had something to read.

Tool: `scripts/scan-secrets.mjs --root <repo> --history`, at `8f42b49`.

---

## 2. Results

Exit 1 means a usable privileged credential in the **working tree**; history hits
never fail the run by design.

| repo | commits | working tree | history | verdict |
|---|---:|---:|---:|---|
| `repid-engine` | 1942 | 7 usable | **1 usable** | see §3.1, §3.2 |
| `hyperdag-protocol` | 192 | 1 usable | 1 usable | §3.2 |
| `trustshell` | 181 | 1 usable | 2 usable | §3.2 |
| `HyperDAG-core` | 80 | 0 | 0 | 4 findings, none usable |
| `trinity-symphony-shared` | 449 | 0 | 0 | 1 finding, not usable |
| `aitrinitysymphony-landing` | 7 | 0 | 0 | 1 finding, not usable |
| `hyperdag-platform` (archived) | 39 | 0 | 0 | 3 findings, none usable |
| `aidebate-io` | 48 | 0 | 0 | 1 finding, not usable |
| `repid` | 43 | — | — | clean |
| `trustrepid` | 76 | — | — | clean |
| `hyperdag-proof-verifier` | 8 | — | — | clean |
| `trust-commons` | 5 | — | — | clean |
| `hyperdag-landing` | 19 | — | — | clean |
| `hyperdag-bench` | 48 | — | — | clean |
| `hyperdag-ecosystem` | 0 | — | — | clean (empty) |
| `example-agent` | 1 | — | — | clean |
| `harmonia` | 1 | — | — | clean |
| `mel` | 12 | — | — | clean |

`trinity-ecosystem` is scanned on every CI run and is not repeated here.
`trustmarket` and `trustrails-dev` were scanned 2026-08-15 — see the OPEN list.

---

## 3. What the findings actually are

### 3.1 The one usable history hit — already settled, no action

`repid-engine` history commit `66bb0701` carries a `jwt:service_role`, 219
chars, `exp 2035-07-08`.

This is the fact already recorded in `CLAUDE.md`:

> *"A copy of the legacy `service_role` JWT is public in
> `DealAppSeo/repid-engine`'s git history and is **inert** because the key is
> disabled — not an incident, no rotation needed."*

**Do not re-open it.** The standing rule attached to it is the one that matters:
never re-enable legacy API keys on this project. The sweep is evidence the
settled fact is still true, not a new discovery.

### 3.2 The working-tree hits are publicly known test keys — and the scanner is right to flag them

Nine usable-in-working-tree flags across three repos. Every one traced to a key
that is public knowledge:

| key | derives | where |
|---|---|---|
| `0x00…01` | `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf` | `repid-engine` ×3, `hyperdag-protocol` ×1 |
| Hardhat account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `trustshell` ×1 |
| repeating `0x0123…` | `0x61755118c2B3eb37D76C57aB9b8f11F434B5F431` | `repid-engine` ×2 |
| `sk-abcdef…` fixtures | n/a | `repid-engine` ×2, `tests/security-audit.test.ts` |

**These are not leaks. They are also not harmless, and the distinction is the
point.** Each EVM value above was tested with `viem` for this sweep and is a
**valid secp256k1 key that derives a real, fundable mainnet address**
[VERIFIED 2026-08-16]. Nobody's secret is exposed — everyone already has these
keys — but any value sent to those addresses belongs to whoever sweeps them
first, and the addresses appear in this ecosystem's source.

That is exactly the reasoning already written into `scan-secrets.mjs`:

> *"A default that is a valid key is a credential, not a comment."*

`trustshell` handles this correctly and is the model to copy — the line is
annotated in place: *"A throwaway well-known test private key (Hardhat account
#0). NOT a real funded key."* A reader hitting it knows in one line. The
`repid-engine` and `hyperdag-protocol` occurrences carry no such note.

**Recommended, low priority, not urgent:** annotate the remaining occurrences
the way `trustshell` does. This does not reduce risk — the keys are public
either way — it reduces the cost of the *next* sweep, which will otherwise
re-derive all of this from scratch.

### 3.3 A hypothesis that was wrong, recorded so it is not retried

While reading the fingerprints, `0x000000…` looked like the all-zero key, which
is **invalid** for secp256k1 (`1 <= k < n`) and derives nothing — which would
have made those four flags false positives and the scanner's "still derives a
real, fundable address" claim wrong.

It is not the zero key. A fingerprint is the first 6 hex digits; the remaining
58 were assumed. Tested against the real file contents, the key is `0x00…01`,
valid, and derives `0x7E5F…Bdf`. **The scanner was right and the inference from
the fingerprint was wrong** — the same shape as the retracted HyperDAG finding,
where a derived scalar was compared instead of the artifact. Read the value, not
its summary.

---

## 4. NOT CHECKED — the private repos

Public clone is the only route available to this session, so **no private repo
was scanned**. This is the largest gap in the sweep and it is not a clean
result:

`trustkeys`, `trusttrader`, `trustchat-frontend`, `AISocialMirror`,
`controller-pwa`, `aitc`, `railway-mcp`, `trinity-telegram-bot`,
`trinity-symphony-framework`, `AI-Symphony-Manager`, `PurposeHub-AI`,
`defuzzyai`, `file-shuttle-craft`, `Hyper-DAG`, `HyperDAG`, `aidebate`,
`image-bearer-ai`, `ImageBearerAI`, `trinity-harmony-orchestra`,
`ExternalActivityTracker1`, `ExternalActivityHacker`.

**`trustkeys` is the one to do first** — on its name alone it is the highest
prior probability in the list, and it has never been scanned. Reaching it needs
`add_repo` approval, or a run from somewhere with the credentials.

Being private lowers exposure; it does not lower the value of knowing. A private
repo can be made public, forked, or cloned by anyone with read access, and a
credential in its history survives all three.

---

## 5. What this sweep does not establish

- **Nothing about private repos.** §4. Eighteen public repos being clean says
  nothing about the twenty-one that were not read.
- **Nothing about non-git secret stores** — Railway and Vercel environment
  variables, Supabase config, CI secrets. This scanned git, only git.
- **Nothing about whether the well-known addresses in §3.2 hold value.** No
  balance was queried. If that matters, query it — the addresses are public and
  the check is one RPC call.
- **The scanner's own coverage bounds it.** It matches JWTs, Solana base58,
  prefixed opaque keys and EVM 32-byte hex. A credential in a shape it does not
  model is invisible to it, and a clean result here means "clean against those
  four patterns."
