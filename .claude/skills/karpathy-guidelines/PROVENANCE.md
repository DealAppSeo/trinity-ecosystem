# Provenance — karpathy-guidelines

`SKILL.md` is **third-party content, vendored unmodified.** Do not edit it in
place; if it needs changing, re-vendor from upstream or write a separate skill
beside it. Editing it silently makes the version below a lie.

| | |
|---|---|
| upstream | `https://github.com/multica-ai/andrej-karpathy-skills` |
| commit vendored | `2c60614` |
| vendored on | 2026-08-15 |
| licence | **MIT** (declared in the skill's own frontmatter and `plugin.json`) |
| author | Jiayuan Zhang — `forrestchang` / `@jiayuan_jy`; commits via `herobrine19` |

## Who wrote this, and who did not

**Andrej Karpathy did not write it.** Upstream is titled *"Karpathy-**Inspired**
Claude Code Guidelines"* and describes itself as *derived from* one public
Karpathy X post on LLM coding pitfalls. It is authored by the same person who
wrote Multica, whose README it advertises.

Recorded because the repo was introduced here as Karpathy's own work, and this
codebase's whole discipline is not restating an unchecked attribution.

## Why it is safe to load

67 lines of prose. **No scripts, no network calls, no tool invocations, no
`allowed-tools` frontmatter.** It can influence how an agent writes code; it
cannot execute anything. That is the entire reason it was installable without a
security review.

## What it adds over `CLAUDE.md`

Two of its four principles are already enforced here, more strictly:
*Think Before Coding* is a weaker form of the three-outcome rule, and
*Goal-Driven Execution* is `work-contract.ts` with hard per-criterion floors.

The additive half is **Simplicity First** and **Surgical Changes** — nothing in
`CLAUDE.md` pushes back on over-building, and *Surgical Changes* is the
file-level form of the *must-not-touch* column in `docs/AGENT-LOOP-PROMPTS.md`,
which exists because agents have edited across lane boundaries here before.

Full assessment, including the Multica platform it came from and the licence
boundary that governs adopting it: `docs/MULTICA-ASSESSMENT-2026-08-15.md`.
