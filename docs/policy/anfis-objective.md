# ANFIS-TS + LASSO routing objective

Trust Passport routing surface (Phase 1 lock).  
Consumes five-axis \(\Pi\), user emphasis, and provider Capability Declarations.  
Does not recompute portable reputation. Does not treat BFT as evidence.  
Does not invent a doer-verified-work leaf.

**Diff from previous (chat-only):** this is the first file version. Content is the locked ANFIS-TS + LASSO surface, hot/warm/cold rules, degradation order, and CC identities from the Phase 1 lock cycle.

Phrase: spine in place; activation incomplete.

---

## 1. What is portable vs what routes

| Object | Owner | Role |
|---|---|---|
| \(\Pi_a = (S,P,H,Q,E)\) | Passport (De Rossi) | Earned, portable. Same \(\Pi\) ⇒ same eligibility class across rails. |
| \(A^{\mathrm{eff}}\) | Authority (Goertzel) | \(\min(R^{\mathrm{route}}, 100\sqrt{S})\cdot\mathbf{1}[\mathrm{builder}\ge 500]\) |
| \(\hat y_p, \beta\) | Router (Cherny) | Chooses providers. Consumes \(\Pi\) and \(A^{\mathrm{eff}}\); does not rewrite them. |

Weights (from `authority-policy.v0.5.yaml`):

\[
w = (w_S,w_P,w_H,w_Q,w_E) = (0.35,\ 0.20,\ 0.15,\ 0.10,\ 0.20)
\]

Missing axis \(\to 0\), then renormalize. Do not pour leftover into BFT.

---

## 2. Inputs (all mapped to \([0,1]\))

### 2.1 Agent and user

User emphasis \(e \ge 0\), \(\lVert e\rVert_1 = 1\). If omitted, \(e = w\).

\[
\hat e = \frac{e \odot w}{\lVert e \odot w\rVert_1}, \qquad
\pi_a = \langle \hat e,\ \Pi_a \rangle \in [0,1]
\]

Renormalize \(\Pi_a\) first if any axis is absent.

### 2.2 Provider Capability Declaration \(p\)

| Symbol | Meaning | Map |
|---|---|---|
| \(c_p\) | cost (USD or class 0–3) | \(\hat c_p = \mathrm{clip}_{[0,1]}(c_p / c_{\mathrm{budget}})\) |
| \(\ell_p\) | latency class | hot \(\mapsto 0\), warm \(\mapsto 0.5\), cold \(\mapsto 1\) |
| \(d_p\) | degradation_class | none \(0\), partial \(0.5\), fallback \(1\) |

### 2.3 Eligibility (hard)

\[
p \in \mathcal{E}(a) \iff
A^{\mathrm{eff}}_a \ge \theta_{\mathrm{class}}(p)
\ \wedge\
\bigl(\text{if }p\text{ is evaluator then }\mathrm{DID}_p \ne \mathrm{DID}_{\mathrm{doer}}\bigr)
\]

Priors (tune in Phase 3; testnet may need \(\theta_{\mathrm{hot}}=1000\)):

\[
\theta_{\mathrm{hot}} = 2000,\quad
\theta_{\mathrm{warm}} = 500,\quad
\theta_{\mathrm{cold}} = 0
\]

Unknown health \(\ne\) healthy. Unknown \(\ne\) hot.

---

## 3. Local linear cost (cold-start consequent)

\[
L_p =
\alpha_c \hat c_p + \alpha_\ell \hat\ell_p + \alpha_d \hat d_p - \alpha_\pi \pi_a
\]

Priors: \((\alpha_c,\alpha_\ell,\alpha_d,\alpha_\pi) = (0.30,0.30,0.20,0.20)\).

Higher \(\pi_a\) **lowers** cost: earned authority unlocks hotter options. It does not waive evaluation.

Until a fit exists, every ANFIS consequent is this \(L_p\). That is an honest cold start.

---

## 4. ANFIS — Takagi–Sugeno, two antecedents

Memberships on \(\pi_a\) and \(\hat c_p\):

\[
\mu_L(x)=\max(0,1-2x),\quad
\mu_M(x)=\max(0,1-2\lvert x-0.5\rvert),\quad
\mu_H(x)=\max(0,2x-1)
\]

Nine rules \(i = 1\ldots 9\): IF \(\pi\) is \(A\in\{L,M,H\}\) AND \(\hat c\) is \(B\in\{L,M,H\}\) THEN

\[
y_i = q_{i0} + q_{i\pi}\pi_a + q_{ic}\hat c_p + q_{i\ell}\hat\ell_p + q_{id}\hat d_p
\]

Firing strength \(w_i = \mu_A(\pi_a)\,\mu_B(\hat c_p)\). Output utility (higher better):

\[
\hat y_p = \frac{\sum_i w_i y_i}{\sum_i w_i + \varepsilon}
\]

Cold start: all \(q_{i\cdot}\) identical and equal to the coefficients of \(-L_p\) (utility \(= -L_p\)). ANFIS then **is** the linear cost. No fake fuzzy system.

---

## 5. LASSO

### 5.1 Rule sparsity (fit time, Phase 3+)

\[
\min_q\ \sum_{\mathrm{hist}}(\hat y - y^\star)^2 + \lambda_{\mathrm{L1}}\sum_i\sum_j \lvert q_{ij}\rvert
\]

Unused rules \(q_i \to 0\).

### 5.2 Provider mix (every decision)

\[
\min_{\beta \ge 0}
\sum_{p\in\mathcal{E}(a)} \beta_p L_p + \lambda_\beta \lVert\beta\rVert_1
\quad\text{s.t.}\quad \sum_p \beta_p = 1
\]

\(\lambda_\beta \to \infty\): one provider. Production prior: support is \(\{\mathrm{primary}\}\) or \(\{\mathrm{primary},\ \mathrm{independent\ evaluator}\}\). Evaluator DID \(\ne\) doer DID.

BFT is not a term in \(L_p\). Doer-verified-work is not a term in \(\Pi\).

---

## 6. Hot / warm / cold

First match wins:

\[
\mathrm{class}(p)=
\begin{cases}
\mathrm{hot}
  & d_p=\mathrm{none}\ \wedge\ \ell_p=\mathrm{hot}\ \wedge\ \hat c_p \le 1\ \wedge\ \mathrm{healthy}\\[4pt]
\mathrm{warm}
  & d_p \ne \mathrm{fallback}\ \wedge\ \bigl(\ell_p=\mathrm{warm}\ \vee\ \hat c_p\in(1,1.5]\ \vee\ d_p=\mathrm{partial}\bigr)\\[4pt]
\mathrm{cold}
  & \text{otherwise}
\end{cases}
\]

Eligibility by class:

- hot: \(A^{\mathrm{eff}} \ge \theta_{\mathrm{hot}}\)
- warm: \(A^{\mathrm{eff}} \ge \theta_{\mathrm{warm}}\)
- cold: eligible whenever \(\mathcal{E}(a)\) otherwise holds

---

## 7. Graceful degradation

Lexicographic order. Stop at first feasible.  
**Correctness (independent evaluator) \(\succ\) family \(\succ\) heat \(\succ\) cost.**

1. Same capability family, **hot**, \(\mathcal{E}(a)\)
2. Same family, **warm**
3. Cross-family **warm** (required if the slot is an evaluator and same-family is the only remaining hot — family-disjoint beats heat)
4. Same family, **cold**
5. Cross-family **cold**
6. **Fail closed** (structured deny). Never silent skip.

A hot same-DID evaluator is illegal and is never step 1. Pay/review already fail closed (#104).

---

## 8. Mathematical hooks CC must exhibit

Identities, not schemas. A measurement that cannot produce these numbers has not wired the policy.

\[
\begin{align*}
W &= \max\bigl(0,(t_{\mathrm{now}}-t_{\mathrm{last}})/7\mathrm{d}\bigr)
  &&\text{or skip if }t_{\mathrm{last}}\text{ is null}\\
K &= \min\bigl(8,\max(1,\lceil W\rceil)\bigr)\\
\sum_{k=1}^{K}\Delta_k &= \Delta^{\mathrm{full}}\\
R^{\mathrm{route}} &= R^{\mathrm{pre}} - \tfrac12 \Delta^{\mathrm{landed}}
  && \sigma=1,\ k\le K\\
A^{\mathrm{eff}} &= \min\bigl(R^{\mathrm{route}},\,100\sqrt{S}\bigr)\\
\delta(1) &> \delta(10) > \delta(100) = 0\\
\delta_{\mathrm{unproven}} &= 0\\
\Pi &= \mathrm{renorm}(w \odot \mathbf{1}_{\mathrm{axis\ present}})\\
\pi &= \langle \hat e,\ \Pi\rangle\\
p\in\mathcal{E}(a) &\Rightarrow \mathrm{DID}_p \ne \mathrm{DID}_{\mathrm{doer}}\ \text{if evaluator}\\
\mathrm{support}(\beta) &\subseteq \mathcal{E}(a)
\end{align*}
\]

Backtest quadruple (Phase 2 contract):

\[
\Bigl(
  \max_a \lvert \Delta R^{\mathrm{route}}_k\rvert,\
  \mathrm{median}_a W,\
  \delta(1)/\delta(10),\
  \lvert\mathrm{support}(\beta)\rvert
\Bigr)
\]

must be finite, and referral mutants M1–M8 in `authority-policy.v0.5.yaml` must pass.

GA constraint (identity only): one decay tick \(\leftrightarrow\) one \(\Delta_k\); skip rows produce no decay identity; \(n\) is monotone per referrer; no second writer beside the CC survivor.

---

## 9. Phase

**Phase 1 (this file):** lock.  
**Phase 2:** measure the identities and mutants.  
**Phase 3:** fit \(q_{ij}\) and \(\theta_{\mathrm{hot}}\) from data; do not reopen \(\delta(n)\) or \(\lambda_\sigma\) unless a mutant fails.

Not claimed: ANFIS already fitted, decay enforced, BFT live, doer leaf, best-in-class, Vercel = A18.
