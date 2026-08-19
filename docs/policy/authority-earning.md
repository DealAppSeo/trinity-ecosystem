# Authority earning (one page)

How five-axis \(\Pi\) and \(A^{\mathrm{eff}}\) jointly decide what an agent may do. Technical mapping, not a claim of enforcement beyond what is already Live / Soft-live.

## Two numbers, two jobs

\[
\Pi_a = w_S S + w_P P + w_H H + w_Q Q + w_E E
\quad w=(0.35,0.20,0.15,0.10,0.20)
\]

Missing axis \(\to 0\), renormalize. \(\Pi\) is **portable reputation**: the same vector is what a counterparty on another rail can recompute from the ledger (De Rossi: ERC-8004-shaped, evidence-tagged, not a private score).

\[
A^{\mathrm{eff}}_a = \min\bigl(R^{\mathrm{route}}_a,\ 100\sqrt{S_{\mathrm{USD}}}\bigr)\cdot\mathbf{1}[R_{\mathrm{builder}}\ge 500]
\]

\(A^{\mathrm{eff}}\) is **spendable authority** on this rail: capped by stake so a high \(R\) without collateral cannot clear a large x402. During decay envelope \(\sigma=1\), \(R^{\mathrm{route}}=R^{\mathrm{pre}}-\frac12\Delta^{\mathrm{landed}}\) (integer ticks). \(A^{\mathrm{eff}}\) never uses a float \(\delta\).

## What the agent is allowed to do

| Act | Gate | Reads |
|---|---|---|
| Pay (x402) | Live: contracted eval + \(A^{\mathrm{eff}} \ge\) requested real collateral | \(A^{\mathrm{eff}}\), `real_collateral_usd`, not simulated |
| Be routed to a **hot** provider | Soft-live: \(A^{\mathrm{eff}}\ge\theta_{\mathrm{hot}}\) and declaration healthy | \(A^{\mathrm{eff}}\), Capability Declaration |
| Be routed to **warm** / **cold** | \(\theta_{\mathrm{warm}}\), then cold | same; unknown declaration \(\ne\) hot |
| Earn \(Q\) (referral) | Soft-live: qualified \(n\), integer \(\delta(n)\in\{12,8,5,4,0\}\), evidence | \(\Pi_Q\) only |
| Earn \(E\) (impact) | Soft-live: \(I\), integer \(\delta_{\mathrm{imp}}\), bounty +8 iff \(I\ge0.85\) | \(\Pi_E\) |
| Judge another agent | Live: \(\mathrm{DID}\ne\mathrm{doer}\); \(\Pi\) does not waive this | identity, not \(\Pi\) |
| Claim BFT-backed score | Observe: 0 rows; \(\Pi\) must not substitute BFT for missing \(S\) | — |
| Doer-verified-work | Blocked | — |

\(\Pi\) does **not** raise \(A^{\mathrm{eff}}\). High \(P\) or \(E\) cannot buy a larger withdrawal; that would make peer/impact a second stake. High \(\Pi\) (emphasis-aligned \(\pi_a=\langle\hat e,\Pi\rangle\)) **lowers routing cost** \(L_p\) so earned downstream value unlocks hotter providers — it does not skip evaluation.

## Goertzel / De Rossi, as mechanisms

Goertzel’s bar here is **authority earned by measured downstream value**, not assigned rank. \(E\) (impact \(I\): severity \(\times\) who \(\times\) proof) and \(Q\) (qualified referrals, decaying in \(n\)) are the value channels. \(S\) is performance already quorum-gated. \(A^{\mathrm{eff}}\) spends only what stake can back. Decay ticks are measured \(W\), not a vibe. That is an evaluation ecology: every grant is an event with \(\delta\in\mathbb{Z}\) and a skip/fail.

De Rossi’s bar is **portability**. \(\Pi\) is a vector over named axes with missing-axis renormalization; a stranger with the ledger can recompute it. \(A^{\mathrm{eff}}\) is rail-local (stake, builder floor, soft-landing). Passport carries both: portable \(\Pi\), local \(A^{\mathrm{eff}}\), and `soft_landing_active` \(\iff\sigma=1\) without claiming decay is enforced.

Not claimed: best-in-class; BFT live; HAL healthy; doer leaf; Vercel = A18.
