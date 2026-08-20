# Authenticating `/api/trustrails/pay` — proposal

**Status: PROPOSAL. Enforcement is OFF and stays off until Sean decides.**
`PAY_AUTH_MODE` defaults to `observe`; nothing is denied today.

---

## 1. What is true now

`app/api/trustrails/pay/route.ts` has **no authentication of any kind**. The only
barrier is that `agentName` must exist in `agent_kya_registry` — a lookup, not a
credential. Agent names are not secret; `agent_kya_registry` carries
`{anon} SELECT USING (true)` and the publishable key ships in the browser bundle,
so **the names are readable by anyone who views source** (`LESSONS.md` S1).

The route moves USDC and writes reputation. `updateRepID` recomputes
`repid_tier` and both spending limits in the same statement, so a caller who can
reach this route can move the ceiling that bounds the next call.

**What is already shipped** (commit `93c7158`, observe mode): `lib/trustshell/pay-auth.ts`
computes an HMAC-SHA256 over `timestamp.rawBody` against `TRUSTRAILS_HMAC_SECRET`
inside a 5-minute window, and reports a verdict. It denies nothing.

## 2. The number that should decide this, and we do not have it

**Nobody can say how many live callers enforcement would break.** That is the
real reason authentication never shipped, and no amount of design resolves it.

The observe-mode field `auth.wouldDenyUnderEnforcement` exists to produce that
number from real traffic. Until it has been read over a representative window,
every option below is a guess about blast radius.

**Recommendation: do not choose a scheme yet. Read the field first.**

The blocker is that the fleet has been down since 2026-07-17 and
`kya_compliance_receipts` last took a row on **2026-04-01**, so the window
currently produces no traffic to measure. Enforcement and the Railway redeploy
are therefore coupled: the redeploy has to come first, or the measurement window
never opens.

## 3. Options

### A. Shipped: HMAC over the request body *(recommended, already in observe)*

`x-trustrails-signature: sha256=<hex>` over `timestamp.rawBody`, plus
`x-trustrails-timestamp`, verified against `TRUSTRAILS_HMAC_SECRET`.

- **Binds the credential to the request.** A captured signature for 100 USDC
  cannot be replayed for 100,000 — asserted directly in `check:pay-auth`.
- **Reuses existing credential vocabulary**: the same `MIN_AUDIT_SECRET_LENGTH`
  bound and the same refusal of the published `ABANDONED_DEFAULT_SECRET`, checked
  *before* the length test because it is long enough to pass one.
- **Cost to callers:** every caller must sign. That is the whole blast radius,
  and it is why the number in §2 matters.
- **Weakness:** one shared secret. It authenticates *a* holder, not *which*
  holder — no per-agent attribution, and rotation is fleet-wide.

### B. Per-agent keys

Same signing scheme, but the secret is per-agent, looked up by `agentName`.

- Gives attribution and per-agent revocation.
- **Needs a table, an issuance path, and a rotation story** — none exist. It also
  puts a secret next to a row that `anon` can already read, so the key column
  would need its own RLS treatment, and getting that wrong is worse than option A.
- Reasonable as a *later* migration from A; the wire format is unchanged.

### C. ControlProof / delegated capability

The route already runs a ControlProof shadow (`CustodyShadow`), which today
reports `not_comparable` on essentially every observation because nothing
presents a proof.

- Right long-term answer: it authenticates the *delegation chain*, not a shared
  secret, and it composes with `effectiveAuthority`.
- **Cannot be the first step.** The policy lists `control_proof` under `observe`
  and states it "cannot approve or deny". Making it authoritative is a
  cross-lane decision, and `promote.cannot_promote` bars
  `using_shadow_control_proof_to_approve` outright.

### D. Network-level (allowlist / mTLS at the edge)

- Cheapest to operate; no code change and no caller change if the callers are
  already known hosts.
- **Does not bind the request.** Anything inside the perimeter can spend
  anything, and the perimeter here is Railway + Vercel, not a private network.
- Worth having *in addition to* A, never instead of it.

## 4. Recommended sequence

1. **Redeploy the fleet** (OPEN, Sean) so the observe window produces traffic.
2. **Read `auth.wouldDenyUnderEnforcement`** over that window. Publish the count.
3. If the count is ~0, set `TRUSTRAILS_HMAC_SECRET` and `PAY_AUTH_MODE=enforce`.
   If it is not ~0, the list of denied callers is the migration plan.
4. Revisit B once there is a reason to attribute rather than merely authenticate.
5. C when ControlProof leaves `observe` — a cross-lane decision, not this one.

## 5. Decisions embedded in the shipped module, stated so they can be rejected

- **`NOT_CHECKED` denies under enforcement.** An unconfigured secret must not
  become an open door reached by a missing environment variable. This follows the
  RepID threshold's posture on the same route ("a limit that could not be
  evaluated is not a limit that passed"), *not* BFT's fail-open. If Sean prefers
  the BFT posture here, that is a one-line change and it should be an explicit
  choice, not a default.
- **5-minute replay window.** Bounds replay of a *signed request*; it does not
  make the payment idempotent — that is `reward-idempotency.ts` and the receipt's
  unique key, a separate mechanism for a separate failure.
- **The route reads `req.text()` once** and `JSON.parse`s it. `req.json()`
  consumes the stream, and a signature computed over a re-serialised object
  verifies a different string than the caller signed.

## 6. Not addressed here

Rate limiting, per-agent quotas, and the `x402` settlement path. Authentication
answers *who is calling*; it does not answer *how often* or *how much*, and
`effectiveAuthority` is the mechanism for the latter.
