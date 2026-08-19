# ZK attestation — math/policy (no circuits)

What must be **proven** vs **disclosed**. GateRun marks each predicate MEASURED / NOT_CHECKED / FAILED.  
`witnessHidden` / `provenWithoutSecret` stay **blocked** until a circuit exists. A missing proof is NOT_CHECKED, never a fake `proven=true`.

Source of truth for numbers: `integer-delta-rule.v1.md`, `phase2-e2e-predicates.md`, `phase2-fixture-bounds.yaml` (farm cap **60**).  
Do not author `events.v1.json`. Merge path remains `claude/reconcile-ga-contracts-integer-delta` @ `a328e7c`.

---

## Public inputs vs witness (policy)

| Kind | Public (disclosed) | Witness (proven-not-revealed, when a circuit exists) |
|---|---|---|
| Axis range | axis name, interval \([lo,hi]\), scheme id | exact axis value \(x\) |
| \(A^{\mathrm{eff}}\) vs stake | decision bit, `used_S_real`, `soft_landing_active` | exact \(R^{\mathrm{route}}\), exact \(S_{\mathrm{real}}\) |
| Integer delta | event_type, sign(\(\delta\)), \(\delta\in\mathbb{Z}\) | none — \(\delta\) is already public ledger law |
| Identity | DID of prover (or a commitment to it) | signing key |

Until a circuit exists, **no row may set `provenWithoutSecret=true`**. Disclosure without proof is labeled `disclosed_only`.

---

## Suite Z — axis range proofs

Let axis \(x \in \{S,P,H,Q,E\}\), claimed interval \([lo,hi]\subseteq[0,1]\).

| id | predicate | MEASURED iff | FAILED iff | NOT_CHECKED iff |
|---|---|---|---|---|
| Z1 | \(lo \le x \le hi\) when a verifying proof is present | verifier accepts and \(x\) is in range under honest open | verifier accepts and open shows \(x\notin[lo,hi]\), or verifier rejects a claimed-valid proof | no circuit / no proof object |
| Z2 | proof does not reveal \(x\) (`witnessHidden`) | public inputs omit \(x\); only \([lo,hi]\) and axis id | \(x\) appears in public inputs or receipt body | no proof (blocked leaf) |
| Z3 | missing axis is not proven | renormalized \(\Pi\) does not emit a range proof for that axis | a proof is emitted for an axis that was 0-then-dropped | N/A if all five present |
| Z4 | interval width \(\ge 0\) and \(hi\le 1\), \(lo\ge 0\) | public interval well-formed | \(lo>hi\) or outside \([0,1]\) | no proof |
| Z5 | `provenWithoutSecret=false` while blocked | field is false or absent | field is true | field missing on a path that claims ZK |

Z2/Z5 cannot leave NOT_CHECKED into MEASURED without a circuit. GateRun must not promote on disclosure alone.

---

## Suite ZR — \(A^{\mathrm{eff}}\) used \(S_{\mathrm{real}}\) only

\[
A^{\mathrm{eff}}=\min\bigl(R^{\mathrm{route}},\,100\sqrt{S_{\mathrm{real}}}\bigr)\cdot\mathbf{1}[\mathrm{builder}\ge 500]
\]

\(S_{\mathrm{real}}\) = non-simulated collateral. Simulated x402 is not \(S_{\mathrm{real}}\) (X1–X2).

| id | predicate | MEASURED iff | FAILED iff | NOT_CHECKED iff |
|---|---|---|---|---|
| ZR1 | \(A^{\mathrm{eff}} \le 100\sqrt{S_{\mathrm{real}}}\) | proof verifies that inequality (or open measurement with integer \(R^{\mathrm{route}}\) and measured \(S_{\mathrm{real}}\)) | \(A^{\mathrm{eff}} > 100\sqrt{S_{\mathrm{real}}}\) | \(S_{\mathrm{real}}\) unmeasured (A3) |
| ZR2 | \(S_{\mathrm{sim}}\) not used in the min | `simulated=true` \(\Rightarrow\) that amount excluded from \(S_{\mathrm{real}}\) | simulated amount in the sqrt | no settlement |
| ZR3 | missing Capability Declaration does not change \(A^{\mathrm{eff}}\) | F-AEFF: \(A^{\mathrm{eff}}\) unchanged; class \(\ne\) hot | \(A^{\mathrm{eff}}\) moved when declaration absent | declaration optional and absent with no class recorded |
| ZR4 | `used_S_real` disclosed; exact \(S_{\mathrm{real}}\) not required in public inputs | boolean present; proof (if any) binds to \(S_{\mathrm{real}}\) commitment | `used_S_real=true` while only simulated collateral exists | no proof and no pay path |
| ZR5 | \(\sigma=1\) \(\Rightarrow\) \(A^{\mathrm{eff}}\) uses \(R^{\mathrm{route}}\) not \(R_{\mathrm{ledger}}\) | D10 holds | uses ledger \(R\) while envelope open | skip (D1–D3) |

Open measurement of ZR1 without a circuit is allowed (integer \(R\), measured USD) and counts MEASURED for the **inequality**, not for `witnessHidden`.

---

## What this file does not authorize

- Changing circuit public inputs (cross-lane).  
- Claiming holder threshold proof.  
- A new soft-live surface. These suites are **measurement hooks** on blocked/observe ZK and live/soft-live \(A^{\mathrm{eff}}\).
