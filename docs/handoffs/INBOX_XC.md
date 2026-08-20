# Inbox — XC

Newest entry on top. See `README.md` in this directory for format and what this is/isn't.

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
