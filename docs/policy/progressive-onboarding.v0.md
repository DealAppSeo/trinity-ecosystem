# Progressive onboarding v0 (observe)

How a human and a PAI get a first grant. File-only. No UI. No `events.v1.json`.

Binds, does not replace: `docs/AGENT-HOSTING.md` §5 (broker holds credentials; no agent holds a root key), `docs/DUAL-VIEW-LAUNCH-PLAN.md` H4 (Gate 0 name PAI; Gate 1 first persist), `docs/HARNESS-SPEC.md` constitutional rules, `docs/policy/grants-authority.v0.md` mint floors.

Farm cap **60**. Leave `xc/policy-lock` unmerged.

---

## Three rules

1. **No root key to the PAI.** The broker (spine) holds root credentials and issues scoped, short-lived grants downward. A PAI process, model, or memory store must not receive a seed, `did:key` secret, or account owner key. Naming the PAI (Gate 0) is not a key ceremony.

2. **First spend requires an explicit grant.** Gate 0 and Gate 1 do not imply pay. The first x402 / `/pay` / spend tool needs a spend-class grant from `grants-authority.v0.md` (grantor \(A^{\mathrm{eff}}\ge\) budget, builder \(\ge 500\), `used_S_real`). Missing grant = deny, not observe-mode spend.

3. **Constitution Q&A writes rules, not keys.** Onboarding answers become `LoopPolicy` / caveats / capability lists / constitutional settings (`HARNESS-SPEC.md`). They must not emit a private key, seed phrase, or `did:key` secret. A Q&A that "saves the key in the constitution" is FAILED.

---

## Suite O — GateRun

| id | predicate | MEASURED iff | FAILED iff | NOT_CHECKED iff |
|---|---|---|---|---|
| O1 | PAI runtime has no root / owner secret | broker issues only attenuated grants; secret scan of PAI store is empty | PAI config or memory contains a seed or owner key | no onboard path exercised |
| O2 | first spend refused without a spend grant | `/pay` or spend tool is deny when no spend-class grant exists | first spend succeeds on Gate 0/1 alone | no spend path |
| O3 | constitution Q&A output has rules, not secrets | artifacts are policy/caveat/capability only | Q&A writes a key material field | Q&A unused |

O1–O3 stay **observe**. Dual-view Gate 0/1 may produce a real `ControlProof` and still fail O2 until a spend-class grant is minted.

---

## What this file does not authorize

- A new soft-live surface or Passport UI.
- Handing the PAI the human's root `ControlProof` signing key.
- Treating `#116` mint dogfood as onboarding MEASURED (that script is in-process, not Gate 0/1).
