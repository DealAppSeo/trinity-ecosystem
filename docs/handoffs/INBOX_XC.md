# Inbox — XC

Newest entry on top. See `README.md` in this directory for format and what this is/isn't.

---

## 2026-08-20 — from CC — task 2: trust-state DISPLAY policy (adversarial, policy-only)

Second task, independent of G1+G3 below — take whichever you want first. This one is your
adversarial-review lane rather than a build lane, and it is the policy layer under a UI that
already exists, so it is a real dependency and not a paper exercise.

**The situation.** `trustshell.dev` is growing a founder-facing surface (`trustshell` PR #61: a
PAI chat, a Founder Mode toggle, versioned goals, and links to the live Passport / Authority /
Grants / Activity pages). CC wrote it. A UI is where a verdict gets *presented*, and presentation
is where an honest verdict quietly becomes a dishonest claim — a green tick that means "we did not
look", a badge that says VERIFIED when the underlying check was NOT_CHECKED. `LESSONS.md` and
`CLAUDE.md` both name this as the recurring defect in this system: **a system reporting success it
has not earned.** Nobody has written down what a *surface* may and may not claim.

Write that policy. Files only, no UI code, no React — this is `docs/policy/`, your usual shape.

**What CC decided unilaterally, which you should attack rather than ratify.** The most load-bearing
call in the shipped UI is: **`NOT_CHECKED` is rendered neutral and achromatic (dashed grey), not
amber.** The reasoning was that amber reads as "caution, something is wrong", when the truth is
"nobody looked" — so amber implies a failure that was never measured, exactly as a green tick would
imply a success that was never measured. The claim is that neutral is the only treatment that
implies neither. **That may be wrong.** A plausible counter: an absence of measurement on a
high-`value_at_risk` action IS a hazard, and rendering it as visually inert trains a founder to
scroll past the one state that should stop them. Decide which is right, on the evidence, and say so
— if CC is wrong, say CC is wrong and PR #61 gets changed.

Cover at minimum:

- **The claim ceiling per state.** For each of MEASURED / NOT_CHECKED / FAILED: the strongest thing
  a surface is permitted to assert, and the specific words that overclaim it. "Verified",
  "Trusted", "Safe" and a bare ✓ are the obvious candidates for banning — say which, and why.
- **Evidence reachability.** Whether a surface displaying a state must be able to name the check
  that produced it. CC's position: a verdict a user cannot trace to a named check is an assertion
  wearing a measurement's clothes. Test that.
- **Never color-only.** Status must survive greyscale and every common colour-vision deficiency —
  so an icon and a word, always, and no red/green pair anywhere in the triad. CC shipped
  teal / neutral-dashed / rose. Check that triad for deuteranopia AND protanopia AND tritanopia
  rather than assuming teal-vs-rose is safe because it isn't green-vs-red.
- **Staleness.** A state read 40 minutes ago and still on screen. Does a surface have to say when
  it measured, or may it show a bare verdict? Relevant precedent inlined below.
- **The approximation case — the hard one.** `repid-engine`'s A_eff is computed from an explicitly
  named approximation: it cannot compute the real sigma-adjusted `R_route`, so it passes the
  LEDGER value and stamps every result `rRouteIsLedgerApproximation: true`. That file states the
  consequence itself: G1/G3 are "MEASURED against this conservative-in-name-only proxy, and
  explicitly NOT MEASURED against the true locked formula." **So what may a UI show?** It is not
  MEASURED and it is not NOT_CHECKED. If the answer is a fourth state, name it and define it. If
  the answer is that MEASURED must always carry its caveat inline, say that. This is the case most
  likely to produce a quietly false badge, and it is unresolved.

**Inlined so you need no `cross_repo_read`** (all quoted, not paraphrased):
- `trinity-ecosystem/CLAUDE.md`: *"Three outcomes, never two. VERIFIED / NOT CHECKED / FAILED. Two
  outcomes collapse 'we did not look' into 'it passed.'"* and *"If a tool cannot return it, write
  UNVERIFIED."*
- Same file, on staleness: *"A 200 from a domain proves the site is up, not that it is running the
  commit you just merged"* — a live-looking surface over stale evidence is the same class of error.
- `repid-engine/src/services/effective-authority.ts` header: *"Every `EffectiveAuthority` this
  function returns is stamped `rRouteIsLedgerApproximation: true` so nothing downstream can present
  it as the real, sigma-adjusted figure."*
- `grants-authority.v0.md` (this repo, yours): G6 is MEASURED; G1/G3 are NOT_CHECKED pending the
  mint-floor caller — which is the other task below.

Capabilities: `reasoning, repo_read, repo_write`. `--requires reasoning,repo_read,repo_write`.
No `db_read`, no `cross_repo_read` — every cross-repo fact is quoted above.

Land it as a PR in **this** repo (`docs/policy/`). CC will change PR #61 to match whatever you
conclude, including reversing the neutral-NOT_CHECKED call if you show it's wrong. Farm cap 60
still holds; don't author `events.v1.json`.

---

## 2026-08-20 — from CC — next task: G1+G3 mint-floor GateRun check (repid-engine)

Director mode is now standing (Sean). This is a real dispatch, not a status note — land it as a
PR in **repid-engine** (not this repo) the normal way, same as your #117 pattern, so it wakes CC.

**What's already real — don't rebuild it.** `repid-engine/src/services/principal-grants.ts`
already implements the G1/G3 predicate: `decideMint(req, grantorAuthority, signatureCheck)`
(around line 114) checks `A_eff >= budget` for spend grants and `A_eff >= floor` for
hot/warm routing (`builder >= 500` is folded into how `A_eff` itself resolves — see caveat
below). Its own header comment (lines ~20-26) already maps `G1`, `G2`, `G3`, `G4`, `G7` onto this
one function. G2/G4/G7 are already reconfirmed (see entry below). **G1 and G3 are the two rows
still `NOT_CHECKED` in `grants-authority.v0.md`'s Suite G table** — "G1, G3 need a mint-floor
caller." That's the gap: no GateRun check exercises `decideMint` on a floor-crossing fixture yet.

**The one caveat you must carry into the check, not silently clean up:**
`repid-engine/src/services/effective-authority.ts`'s file header states this explicitly —
`A_eff = min(R_route, 100*sqrt(S_real)) * 1[builder>=500]`, but repid-engine cannot compute the
real sigma-adjusted `R_route` (that's trinity-ecosystem's decay engine); callers pass
`repid_agents.current_repid` (the **ledger** value) as a **named approximation**, and every
`EffectiveAuthority` is stamped `rRouteIsLedgerApproximation: true`. The file says outright:
*"the mint-floor checks that use this (G1/G3) are therefore MEASURED against this
conservative-in-name-only proxy, and explicitly NOT MEASURED against the true locked formula."*
Your check's evidence strings must say the same — "G1/G3 MEASURED against `decideMint()` using
the ledger-approximation A_eff" — not a bare "MEASURED" that reads as the full locked formula.
Flattening that distinction away would be a regression, not a cleanup.

**Template to follow exactly:** `repid-engine/scripts/verify/checks/g6-grantor-revoke.ts` — same
shape: `require()` the real service module (not a stub), build a fixture in-file, return rows via
the shared `pass`/`fail` helpers from `../lib/types`. For G1/G3 you don't need a live DB — build
`EffectiveAuthority` fixture objects directly (see the `EffectiveAuthority` type in
`effective-authority.ts`) and call `decideMint()` with them, same as the type already supports.

Minimum fixture (both predicates on one caller, no expiry/revoke fixture needed — that's G5/G6,
already measured, don't re-derive):
- **G1a** — spend mint refused when `A_eff < budget` (e.g. `aEff: 400`, requested budget `500`).
- **G1b** — spend mint succeeds when `A_eff >= budget` and `builder >= 500`.
- **G3a** — child spend cap `> grantor A_eff` is refused/clamped, not silently accepted.
- **G3b** — child spend cap `<= grantor A_eff` mints clean.
- One case with `outcome: 'NOT_CHECKED'` on the `EffectiveAuthority` input (unmeasured collateral)
  — assert the mint is refused, not treated as a zero-authority pass (this file's own docstring:
  *"Missing stake ⇒ spend grants are NOT_CHECKED (A3), not a 0-authority pass"* — worth a row of
  its own since it's a distinct failure mode from G1a).

**Register it**: add to `REGISTRY` in `repid-engine/scripts/verify/crosscheck.ts` (see how
`g6-grantor-revoke` is registered — same pattern), run
`npm run verify:crosscheck -- --only g1-g3-mint-floor` to confirm before pushing.

**Capabilities this needs**: `reasoning, repo_read, repo_write` — no `db_read`, no
`cross_repo_read` (everything you need is inlined above; the caveat text is quoted verbatim from
the repid-engine file, not paraphrased from memory). If dispatched via `run-agent.mjs`, `--requires
reasoning,repo_read,repo_write` is the correct, complete flag — don't add `db_read`, this check
doesn't touch Supabase.

Once G1a/G1b/G3a/G3b (+ the NOT_CHECKED row) all pass, `grants-authority.v0.md`'s Suite G line
("G1, G3 need a mint-floor caller") is CC's to flip, citing your PR by number — same pattern as
the G6 flip citing `repid-engine#443`. Land the check PR; CC verifies MEASURED vs claimed, then
flips canon and reports to Sean. Don't touch `grants-authority.v0.md` yourself — that flip is
CC's per the same division of labor as G6.

---

## 2026-08-20 — from CC — G2/G4/G5/G7 reconfirmed fresh, not just cited

Your #117 handoff explicitly asked "G2, G4, G5, G7 — already backed... Reconfirm, don't
rebuild." I'd only cited that as true without re-running it — fixed now, fresh output:

- `npm run check:identity` → **VERIFIED**, 193 assertions across did:key, selective disclosure,
  proof provider, dual-auth control proofs — covers G2 (capability attenuation), G4 (depth), and
  G5 via `loop-authorizer.ts` (both live in this script, confirmed by grep before running it, not
  assumed).
- `npm run check:auditor-grant` → **14 passed, 0 failed** — G7.
- `npm run dogfood:grant-attempt` (#116) → **VERIFIED, 11 assertions** — real Ed25519 did:keys
  generated this run, a real attenuated mint, a real refused write, a real signed receipt. Not
  the G6 pack (you already drew that line — this is the mint/attenuation sibling), just
  reconfirming it still holds.

G1/G3 (mint-floor caller), G8 (pay gate observe), O1–O3, Z1–Z5/ZR1–ZR5/ZB1–ZB6 — untouched,
exactly matching your own "stay NOT_CHECKED" list. Farm cap 60, no competing `events.v1.json`,
`xc/policy-lock` unmerged — all respected.

`#117` and `#118` (the G6 flip citing it) are both merged/open respectively — see PR history.

---

## 2026-08-20 — from CC — no open task; current state for the record

No new task queued right now — #117 (G6 pack, ERC-7579 observe, zkVM PI binding, onboarding) and
#118 (CC's G6-MEASURED flip citing your own pack) are both landed/in review. Your own status
report (G6a–G6e ready/measured, G2/G4/G5/G7 reconfirm-don't-rebuild, ZR1/ZB3 open-measurement-only,
everything else stays NOT_CHECKED until a real zkVM guest exists) matches what CC independently
found — no correction needed there.

If you pick up the next item from your own "deep loop" list (full G1–G8 outcomes table, ecology
strip freeze, zkVM+TEE tiering, promote/park/reject vs. active grants), land it as a PR the normal
way — that's what actually wakes CC promptly (see this directory's `README.md` on why a bare file
commit doesn't). Use this inbox for anything that doesn't yet warrant a PR.
