# Agent and operator addresses

**The canonical, greppable list of every wallet address in the Trinity / HyperDAG
system.** Base Sepolia (chain 84532) unless stated otherwise.

## Why this file exists

It was supplied by hand, several times, in several sessions, because it lived
nowhere an agent could find it. The addresses *were* in the repos — scattered
across `repid-engine/scripts/mint-t12-correct.js`, `src/services/*.ts` and a
`scratch/` results JSON — but nothing named them as a set, so every session
re-asked instead of grepping.

That is the same shape as `docs/AGENT-MEMORY-SPEC.md` § 1: **not a memory
problem, a recall problem.** The measurement there — 429 memory nodes, 429
learning events, 215 learned patterns, **zero ever read** — is the argument
against answering this with a sixth memory store. A store nothing queries is
indistinguishable from no store. What makes a fact retrievable here is that it
sits in git, under a name someone would think to grep, in the repo that owns the
subject.

Addresses are public by construction: every one below is already readable on
Basescan and most are already committed in public repos. **Private keys are not
here and must never be.** The variable names that hold them are named, the
values are not.

---

## T12 agent wallets

| Name | Squad | Address |
|---|---|---|
| ORCH | ORCHESTRATION | `0x28Ee130b0500b580967952EE396d4a66Adf9c9E8` |
| W3C | ORCHESTRATION | `0x7aA57A05A61dd20e0F07B82cC827F5d4a9B848F6` |
| SHOFET | ORCHESTRATION | `0x15eB9A7427f1B54486926465d5895cD51eB8b052` |
| TORCH | ALPHA | `0x3A9061616331B779264A39757c84c46B64955ABF` |
| VERITAS | ALPHA | `0x2832eB385cbe9e71aCf2351489eb62F970EDe9b9` |
| GCM | ALPHA | `0x99b2f3A741923A58dA5fF10fB440351ed63178Cc` |
| CHESED | BETA | `0x62cdd257B9F6ed27320112C13167aC0726630178` |
| MEL | BETA | `0xEf033B6f9cC649d8aD099d7A8e194Eb13AbDB666` |
| APM | BETA | `0xceD17F65E03e7b3a77D5321A2d3715840317199C` |
| SOPHIA | GAMMA | `0x7b84CCE5502d393DAa6533285eF3e2f8D3A13261` |
| NEXUS | GAMMA | `0x038Fd84EFf76513913d9A39bEB41b8189F3a8a2d` |
| HDM | GAMMA | `0x74ea6d9565B8E125BaB2FFb491B39E2fA0bA8928` |

In code the agents carry a `trinity-` prefix (`trinity-torch`, `trinity-sophia`),
which is also how they key `repid_agents`. The bare squad names above are the
operator's shorthand; both refer to the same wallet.

## Operator and infrastructure addresses

| Role | Address | Note |
|---|---|---|
| Deployer — **old** | `0x63f1ACd57A1156F1EdB094507D42F21998c5c341` | superseded; appears in no source file in the four repos checked |
| Deployer / Attestor — **current** | `0xf6eE1768868c3266868edcA78bC41C50309cb22A` | in `repid-engine/src/services/repid-attestation.ts`, `src/routes/v1/launch-status.ts` |
| Custodian | `0xdf6b8215D193b11B4903d223729c3CF7A6de271d` | the `CUSTODIAN` constant in `repid-engine/scripts/mint-t12-correct.js` |
| ERC-8004 operator | `0x93223C321d2f4c136bf1da64DEb3C6Ad484334E1` | held as `ERC8004_OPERATOR_KEY` |
| ERC-8004 writer v2 | `0xb24268884472E7613aA58D38C8813f7Af1667382` | held as `ERC8004_WRITER_V2__KEY` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | contract, not a wallet |

`ERC8004_OPERATOR_KEY` and `ERC8004_WRITER_V2__KEY` are **variable names whose
values are private keys**; the addresses above are the corresponding public
addresses, which is what belongs in a document. Do not paste a value from either
variable anywhere, including a PR body or an issue.

One further wallet exists and is deliberately **not** listed: the operator's
personal address. Its role-labelled form is the `Custodian` row above, which is
already public in code. Publishing the personal association is the part that
cannot be undone — an address can be abandoned, a permanent link between a named
person and their on-chain history cannot.

---

## Provenance, and what was and was not checked

**Supplied by the operator 2026-09-08.** Cross-checked the same day against
`repid-engine/scripts/mint-t12-correct.js`, which independently records ten of
these wallets with their squads.

- **VERIFIED** — ORCH, W3C, TORCH, GCM, CHESED, MEL, SOPHIA, NEXUS, HDM: exact
  string match, squad match, against the committed script.
- **VERIFIED** — every address above is 40 hex characters.
- **NOT CHECKED** — SHOFET and VERITAS carry no wallet in that script (its header
  reads "MINT 10 UNMINTED T12 AGENTS"; both are named elsewhere in the file as
  already minted). Their addresses here rest on the operator's list alone.
- **NOT CHECKED** — no address here was read back from the chain. Nothing below
  confirms that a wallet exists, is funded, or owns the identity token it is
  expected to.

### One discrepancy found, and it is in the code, not the list

`repid-engine/scripts/mint-t12-correct.js` records `trinity-apm` as
`0xceD17F65E0e7b3a77D5321A2d3715840317199C` — **39 hex characters**. Every other
address in that file is 40. The operator's list has `...F65E03e7b3a...` where the
script has `...F65E0e7b3a...`: the script is missing a `3`.

A 39-character address is not a valid address at all; `ethers` rejects it before
any call is made. So the APM entry in that script cannot have worked, and the
version in this table is the only candidate that can. **The script is not fixed
by this commit** — it is in another repo, and changing an address that decides
where an identity token is minted is a decision, not a cleanup.
