# Grants authority v0 (observe)

Who may **mint** a grant, how far it may **attenuate**, who may **revoke**, and what **expiry** does.  
File-only. Not a new soft-live surface. Does not author `events.v1.json` or a UI.

Existing machinery this file binds, not replaces:

- Attenuation: `delegation.ts` (child ⊆ parent; `MAX_DELEGATION_DEPTH = 4`; child expiry ≤ parent).
- Expiry deny: `control-proof.ts` `validityWindow` FAILED; `loop-authorizer.ts` `authorizer_denied`.
- Auditor seat: `auditor-grant.ts` (read-only is computed; auditor ≠ doer; `ttlSeconds` required).
- `#95` ControlProof remains **observe** on the pay gate — a grant does not approve or deny payment.

Source of truth for numbers: `integer-delta-rule.v1.md`, `phase2-e2e-predicates.md`, `phase2-fixture-bounds.yaml` (farm cap **60**).  
Tier floors are the locked ANFIS priors: \(\theta_{\mathrm{hot}}=2000\), \(\theta_{\mathrm{warm}}=500\), \(\theta_{\mathrm{cold}}=0\), builder floor \(500\).

---

## Mint floors (\(A^{\mathrm{eff}}\) / tier)

A grantor mints from a parent proof. \(\Pi\) does not raise the mint cap. Missing stake \(\Rightarrow\) spend grants are NOT_CHECKED (A3), not a 0-authority pass.

\[
A^{\mathrm{eff}}=\min\bigl(R^{\mathrm{route}},\,100\sqrt{S_{\mathrm{real}}}\bigr)\cdot\mathbf{1}[\mathrm{builder}\ge 500]
\]

| Grant class | Mint requires (grantor) | Child may not |
|---|---|---|
| Spend / pay | \(A^{\mathrm{eff}}\ge\) requested budget; builder \(\ge 500\); `used_S_real` | Spend simulated collateral as real; skip contracted eval |
| Hot routing | \(A^{\mathrm{eff}}\ge\theta_{\mathrm{hot}}=2000\) | Classify unknown declaration as hot |
| Warm routing | \(A^{\mathrm{eff}}\ge\theta_{\mathrm{warm}}=500\) | Raise the child's floor above the grantor's \(A^{\mathrm{eff}}\) |
| Cold / read-only auditor | \(\theta_{\mathrm{cold}}=0\); parent proof valid; auditor \(\ne\) doer; `analyseReadOnly` | Reach a write or unclassified tool |

`ttlSeconds` is required and must be positive. A never-expiring grant is refused at mint (already: `control-proof.ts`).

---

## Max budget attenuation

Authority only narrows. Four bounds, all must hold:

1. **Capabilities:** child \(\subseteq\) parent (`excess` empty). Wildcards do not widen.
2. **Budget:** child spend cap \(\le \min(\)parent remaining, grantor \(A^{\mathrm{eff}}\)\()\). Delegation cannot raise \(R^{\mathrm{route}}\) or \(S_{\mathrm{real}}\).
3. **Time:** child `expiresAt` \(\le\) parent `expiresAt`; child `notBefore` \(\ge\) parent `notBefore`.
4. **Depth:** chain length \(\le 4\).

Ledger \(\delta\) stays integer (ID1). USD / \(A^{\mathrm{eff}}\) may be non-applied floats.

---

## Revoke — always allowed to the grantor

The **grantor** (delegator DID on that link; human on the root `ControlProof`) may revoke at any time, including before expiry. The grantee cannot block that revoke. A revoked grant is **deny**, same class as expired.

Today the implementation's only revoke is **expiry** (no revocation registry — `did.ts` / `control-proof.ts`). Mid-life revoke is therefore **NOT_CHECKED** as a live path. This file still requires it: if a registry is added, grantor-initiated revoke is mandatory and fail-closed.

Expiry remaining in force is not a substitute for "grantor may not revoke." `#116` dogfood minted and attenuated a child grant (G2-adjacent). It did **not** revoke. Do not count G5 as G6.

### G6 measurement pack (for CC)

Fixture `F-G6` — construct, then revoke, then present. Do not use expiry as the deny.

| step | action |
|---|---|
| 1 | Human \(H\) issues a root `ControlProof` to grantor \(G\) for capabilities \(C\), `ttlSeconds` \(T>0\), audience bound. |
| 2 | \(G\) `delegate()`s to grantee \(A\): child \(\subseteq C\), tighter caveat, `ttlSeconds` \(<T\). Assert child still unexpired. |
| 3 | At \(t < \) child `expiresAt`, **grantor** (\(G\), or \(H\) on the root) revokes the child. |
| 4 | At \(t' \) with \(t < t' < \) child `expiresAt`, \(A\) presents the child for a tool that step 2 would have allowed. |

| id | predicate | MEASURED | FAILED | NOT_CHECKED |
|---|---|---|---|---|
| G6a | grantor revoke denies subsequent use | step 4 is `authorizer_denied` / `validityWindow` FAILED (revoked class) | step 4 allowed | no revoke API |
| G6b | only the grantor (or root human) may revoke | revoke by \(A\) is refused or is a no-op that does not un-revoke | \(A\) revokes, or \(A\) restores after \(G\) revokes | no revoke API |
| G6c | parent revoke cascades | revoke of the root/parent denies the unexpired child | child still usable after parent revoke | no cascade |
| G6d | pre-revoke bytes do not resurrect | replaying the step-2 proof after step 3 is deny | replay succeeds | nonce consumed without a revoke record |
| G6e | not G5 in disguise | child `expiresAt` is still in the future at step 4 | deny was only because the clock passed expiry | — |

G6 flips to **MEASURED** iff G6a–G6e all MEASURED on this fixture (or a documented equivalent). G6e failing means you measured G5, not G6.

Suggested check name: `check:g6-grantor-revoke`. Must not import a stub that always returns denied. `#116` `scripts/dogfood-grant-attempt.mjs` is the mint sibling, not this pack.

---

## Expired grant is deny, not soft-allow

If `now >= expiresAt` (or `now < notBefore`):

- `validityWindow` = FAILED
- authorizer = `authorizer_denied`
- pay / tool / routing that required the grant **does not proceed**

Not a 200 with a warning. Not `PAY_AUTH_MODE=observe` stretching the window. Observe mode on the pay gate is a different switch; it does not resurrect an expired grant.

A session may outlive its authority; the authority does not stretch to cover it (`loop-authorizer.ts`).

---

## Suite G — GateRun

| id | predicate | MEASURED iff | FAILED iff | NOT_CHECKED iff |
|---|---|---|---|---|
| G1 | spend mint requires grantor \(A^{\mathrm{eff}}\ge\) budget and builder \(\ge 500\) | mint refused when either fails | mint succeeds below floor | no mint path exercised |
| G2 | child capabilities \(\subseteq\) parent | `excess` empty on a verified chain | child holds a capability the parent does not | no chain |
| G3 | child spend cap \(\le\) grantor \(A^{\mathrm{eff}}\) | budget clamped or mint refused | child spendable \(>\) grantor \(A^{\mathrm{eff}}\) | budget not stated on the grant |
| G4 | depth \(\le 4\) | fifth link refused | fifth link verifies | no deep chain |
| G5 | expired \(\Rightarrow\) deny | authorizer denied; no tool/pay proceeds | expired grant allowed | no expiry fixture |
| G6 | grantor may revoke | G6a–G6e all MEASURED on `F-G6` | grantor revoke ignored; only grantee can revoke; or deny was G5 | `F-G6` not run (today) |
| G7 | auditor ≠ doer and read-only computed | `delegateAuditorGrant` refuses otherwise | self-audit grant or write-reachable grant exists | auditor path unused |
| G8 | grant does not approve/deny pay | `#95` shadow still observe | ControlProof grant used as pay gate | — |

G2, G4, G5, G7 are backed by existing tests (`check:identity` / `check:auditor-grant` / loop-authorizer / `#116` mint). G1, G3 need a mint-floor caller. **G6 is ready for measurement** via `F-G6` above — still NOT_CHECKED until that check exists.

---

## ERC-7579-compatible attenuation (observe)

Off-chain analog: this file. On-chain analog, when an MSA exists: [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) modular account.

| 7579 call | Our grant | GateRun |
|---|---|---|
| `installModule(moduleType, module, data)` | **mint** (G1–G4, G7) | MEASURED iff mint floors + attenuation hold on the installed module |
| `uninstallModule(moduleType, module, data)` | **revoke** (G6) | MEASURED iff G6a–G6e hold after uninstall |
| validator | capability check (`permits`) | — |
| executor | spend / routing the grant allows | cannot exceed grantor \(A^{\mathrm{eff}}\) |
| hook | caveats (`maxValue`, audience, ttl) | loosening a hook is FAILED (same as caveat widening) |
| fallback | unknown tool | unclassified = write (`auditor-grant.ts`) |

`moduleType` must not be used to widen: installing an executor whose selector set is not \(\subseteq\) parent capabilities is G2 FAILED.

Uninstall is grantor-allowed (account owner / installer). A module that uninstalls itself without the grantor is G6b FAILED.

**Observe until CC measures.** No Solidity module in this change. No claim of a live MSA. A future `check:g6-grantor-revoke` may use an in-memory 7579-shaped registry (install/uninstall maps) as the revoke API — that is enough to flip G6; it is not an on-chain deployment.

---

## What this file does not authorize

- A new soft-live write. These hooks are **observe**.
- Treating `#95` ControlProof as a custody gate.
- A competing events schema or Passport UI strip.
- Claiming mid-life revoke is already enforced.
- Shipping an ERC-7579 module or treating uninstall-on-paper as G6 MEASURED.
