# Security policy

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting** — the *Security* tab → *Report a
vulnerability*. It opens a channel visible only to the maintainers, so a report
never sits in a public issue while it is being fixed.

Please do not open a public issue for anything exploitable. There is no bug
bounty; we will acknowledge your report and tell you what we did with it.

## Scope, stated honestly

This repository is **pre-production**. On-chain components target **Base Sepolia
(chain 84532)**, a testnet — no mainnet value is at risk in this codebase today.

Two things are worth knowing before you audit:

- **Credentials exist in git history.** They are testnet or already-disabled
  credentials, and their status is documented in `docs/KEY-ROTATION.md` rather
  than hidden. A commit cannot remove a credential from history; rotation is what
  makes a historical entry harmless. Where rotation is outstanding, the file says
  so.
- **The legacy Supabase `anon` / `service_role` JWTs are disabled project-wide.**
  A copy of the legacy `service_role` token is readable in public git history and
  is **inert** because the key class is switched off. Supabase no longer offers
  legacy JWT rotation, so disabling is the available remedy and it has been
  applied. See `docs/KEY-ROTATION.md`. The one standing rule is that legacy API
  keys are never re-enabled on this project.

## What this codebase does to earn trust

The security posture here is mostly about **not asserting things that were not
measured**, because a system that reports success it has not earned is more
dangerous than one that reports failure.

- **Three outcomes, never two.** Checks report `VERIFIED`, `NOT CHECKED` or
  `FAILED`. Collapsing "we did not look" into "it passed" is treated as a defect,
  and the end-to-end suite prints `NOT CHECKED` lines rather than omitting the
  steps it could not run.
- **Secrets are scanned on every push**, in the working tree and across full git
  history (`npm run check:secrets`, `-- --history`). A credential in the working
  tree fails the build; a historical one is reported and pointed at the rotation
  doc, deliberately without failing, so the gate cannot become permanently red
  and therefore ignored.
- **Known-compromised signers are refused at runtime.**
  `scripts/lib/compromised-signer.cjs` aborts if a derived address matches a
  leaked one — checked on the *derived address*, not on an environment variable
  name, so it fires no matter which variable supplied the key.
- **No credential is ever constructed at module scope.** Doing so executes it at
  build time with the builder's environment; that pattern broke every deployment
  of this project for two months in 2026 and is now a documented rule with a
  check behind it.
- **Missing configuration throws and names the variable.** Dummy fallbacks such
  as `|| 'dummy_key'` were removed on purpose: they turned a misconfiguration
  into empty result sets instead of an error.
- **Gates are mutation-tested.** A check that cannot fail is not a check, so the
  suites are probed by deliberately breaking the thing they guard and confirming
  they go red. Two cases where assertions reported green while never executing
  were found this way, and are recorded in `LESSONS.md`.

## Where to look first

| you want | read |
|---|---|
| what is settled, what is open, which numbers were retracted | `docs/PRIOR-WORK-INDEX.md` |
| key status and the rotation runbook | `docs/KEY-ROTATION.md` |
| failures and their root causes, written up rather than deleted | `LESSONS.md` |
| the trust model and what it does *not* prove | `docs/TRUST-HARNESS.md` |
