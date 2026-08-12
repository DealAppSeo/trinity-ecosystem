# Key rotation

What is exposed, what actually needs rotating, and every place each key lives.

Regenerate the findings at any time:

```bash
node scripts/scan-secrets.mjs            # tracked files at HEAD
node scripts/scan-secrets.mjs --history  # every commit reachable from any ref
```

## Findings as of 2026-08-12

Measured, not inferred. Where something could not be checked from a cloud
session, it says so rather than guessing.

| Credential | Where | Complete? | Verdict |
| :-- | :-- | :-- | :-- |
| Supabase `service_role` JWT | `.env.local`, `.next/server/app/dashboard/page.js`, webpack cache — history only, 2026-04-17 → 2026-07-25 (`504bba6`) | **Yes** — 219 chars, 3 parts, `exp` 2035-07-08 | **Rotate.** Bypasses RLS. |
| `AGENT_SOPHIA_PRIVKEY` | `audit_output.txt` | **Yes** — 88-char base58 | Rotate if convenient. Devnet-only. |
| Supabase `anon` / publishable JWT | same places | Yes | No action. Public by design. |
| 3 × 88-char base58 in `TRUST_ATTESTATION.md` | history (`721d52f`) | n/a | **Not secrets.** Transaction signatures — same length as an ed25519 key. |

Three things bound the severity:

- The repository is **private with zero forks**. Exposure is limited to people
  who already have repo access.
- The `AGENT_SOPHIA_*` wallet is **devnet**. Every Solana script targets
  `api.devnet.solana.com`; there is no `mainnet-beta` reference in the repo. The
  wallet appears in **0 of 12** `kya_compliance_receipts` rows and 0
  `agent_kya_registry` rows, so it is not the wallet behind the recorded
  payments.
- Nothing usable remains in the working tree. `scan-secrets.mjs` exits 0.

## ⚠ VERIFIED 2026-08-12 — the same key was PUBLIC for 3.5 months

This supersedes every severity assessment above and below it.

The `service_role` JWT is **not** confined to this private repo. The identical
token — byte-for-byte, SHA-256 `f179551d…`, 219 chars, `ref`
`qnnpjhlxljtqyigedwkb`, `exp` 2035-07-08 — was committed as `service_role.txt`
to **`DealAppSeo/repid-engine`, a PUBLIC repository**:

| | |
| :-- | :-- |
| Added | `fff5500`, 2026-04-20 |
| Removed from HEAD | `973fc09`, 2026-08-03 |
| **Publicly readable for** | **~3.5 months** |
| Still in public history | **Yes** — `fff5500` is reachable from `origin/main` |

Removing it from HEAD did nothing to contain it. Anyone can still run
`git clone https://github.com/DealAppSeo/repid-engine && git show
fff5500:service_role.txt` and read a credential that bypasses RLS on the
production database until 2035.

**Assume this key is compromised.** After 3.5 months of public exposure on a
repo with an Apache-2.0 licence and inbound traffic, "probably nobody looked"
is not a security posture. The earlier framing in this repo — *"private with
zero forks, which is what makes this urgent-but-not-emergency"* — was written
before this was measured and is **wrong for this key**.

The removal commit message is worth reading in full: *"a LIVE prod service_role
key was tracked in this repo — and every gitleaks check was green."* A scanner
ran, passed, and the key sat there anyway.

**Immediate action, in order:**

1. **Disable legacy API keys** in the Supabase dashboard (Settings → API Keys).
   This is the only lever that takes effect immediately, and rotation is not
   available — see below. It is also *reversible*, which now cuts the other
   way: re-enabling legacy keys re-arms a credential that is publicly known.
   Never re-enable this project's legacy keys.
2. **Verify** with `npm run check:legacy-key` from a laptop. Expect `INERT`.
3. **Migrate to asymmetric JWT signing keys, then revoke the old key.** This is
   the only step that actually retires the token rather than disarming it.
4. **Treat anything reachable with `service_role` as potentially read.** That is
   every table, ignoring RLS.

Purging git history is *secondary* here. It would stop future discovery, but
the window has already been open for months, so it does not restore
confidentiality — disabling the key does.

---

**Previously unverified, now settled:** whether the legacy `service_role` JWT is
still accepted by the API is still a separate question from whether it leaked —
run `npm run check:legacy-key` from a laptop. Do not let any doc claim a status
without a measurement behind it; that has now gone wrong twice, in both
directions.

Measure it in five seconds, from a laptop (not a cloud session):

```bash
npm run check:legacy-key
```

It pulls the historical JWTs out of git history, probes PostgREST with each, and
prints one of four states. **The proxy answers a blocked host with HTTP 403**,
which is indistinguishable from an auth rejection by status code alone, so the
script checks that the response actually came from PostgREST before calling
anything a rejection. From a cloud session it prints `NOT MEASURED` and exits 2.

## Deactivated is not revoked

The single most important thing on this page, and the thing that decides whether
you still have work to do.

Supabase's **Settings → API Keys → disable legacy API keys** switch is
[explicitly reversible](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys):
*"You can re-activate them if you find a client you missed, so this step is
reversible."* The token is not changed by it. The legacy `anon` and
`service_role` keys are signed by the project's JWT secret, and that secret is
untouched — so flipping the switch back makes the exact string sitting in this
repo's history a working RLS-bypassing credential again.

So there are three real states, and the middle one is where this project most
likely is:

| State | What it means | What's left to do |
| :-- | :-- | :-- |
| **Live** | Legacy keys enabled. The history copy works. | Disable legacy keys today. |
| **Disarmed** | Legacy keys disabled. History copy rejected. | Don't re-enable. Retire it when convenient. |
| **Retired** | Signing key rotated *and revoked*. Token is dead. | Nothing. |

The `anon` half of this pair was measured as rejected earlier, and the dashboard
control is one switch covering both — so *disarmed* is the likely state. That is
an inference from one measurement plus how the control works, not a measurement
of the `service_role` key itself. `npm run check:legacy-key` settles it.

## You can no longer rotate the legacy JWT secret

Supabase's own guidance is blunt about this: *"it is no longer possible to rotate
the legacy anon, service and JWT secrets."* Earlier revisions of this document
said to "revoke the legacy `service_role` JWT in the dashboard" — **there is no
such button.** The two things you can actually do:

1. **Disable legacy API keys** (reversible, immediate, zero downtime once
   nothing depends on them). This is the disarm.
2. **Migrate to asymmetric [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys),
   then rotate and *revoke* the previous key.** This is the retire, and it is a
   separate migration from the publishable/secret key migration you have already
   done. Rotating alone is not enough — Supabase notes that without the explicit
   revoke, *"older keys will still be valid."*

Step 2 also affects user sessions: until you move to signing keys, the access
tokens Supabase Auth issues to your users are signed by that same shared secret.
Plan it as a migration, not a checkbox.

## Rotating a new-style secret key (`sb_secret_…`)

Not currently needed — no `sb_secret_…` value appears in the working tree or in
history (`scan-secrets.mjs` is clean). Keep for when it is.

Order matters: add the new key everywhere *before* deleting the old one, or you
take the app down between steps. **Deleting a secret key is irreversible.**

1. **Issue** — Supabase → project `qnnpjhlxljtqyigedwkb` → Settings → API Keys →
   create an `sb_secret_…` key.
2. **Vercel** — project `ai-trinity-symphony-landing` → Settings → Environment
   Variables → set `SUPABASE_SECRET_KEY` for every environment you deploy.
3. **Railway** — the host actually serving `app.aitrinitysymphony.com`. Easy to
   miss because the custom domain does not resolve to Vercel; see `CLAUDE.md`.
   Set `SUPABASE_SECRET_KEY` there too.
4. **Supabase Edge Functions** — `supabase/functions/agent-tools` reads its own
   secrets, set separately from both hosts.
5. **Local** — your `.env.local`.
6. **Delete the legacy names everywhere.** `lib/supabase-admin.ts` reads, in
   order: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_KEY`. A stale legacy value left on one host
   silently wins there and nowhere else, which is the hardest kind of bug to
   see.
7. **Redeploy both hosts**, then **delete** the superseded `sb_secret_…` key in
   the dashboard. (For the *legacy* `service_role` JWT the equivalent step is
   disabling legacy API keys — see above. There is no revoke button for it.)
8. Confirm: the server logs should carry no `[supabase-admin] … legacy
   service_role JWT` warning. That warning fires once per process whenever a
   legacy JWT is in use.

No GitHub Actions secrets to update — no workflow references Supabase.

## Rotating the browser key (optional)

**This does not fix the RLS exposure.** The publishable/anon key ships in the
browser bundle by design; a new one ships the same way and reads the same rows.
The fix for `{anon} SELECT USING (true)` on `agent_kya_registry` and
`kya_compliance_receipts` is the policy, not the credential.

If rotating anyway: same hosts as above, plus note that `lib/supabase-browser.ts`
reads three names in order — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`NEXT_PUBLIC_*` is inlined at build time, so **a redeploy is mandatory**; changing
the variable alone changes nothing in an already-built bundle.

## Why history still holds these

`git rm` removes a file from the current tree, not from history. Anyone who can
clone can `git log -p` a deleted secret back out. Rewriting history
(`filter-repo`, force-push) invalidates every open branch and clone and is not
worth it here: once the credential is *retired*, the copy in history is inert.

Note the word. If legacy keys are merely **disabled**, the history copy is not
inert — it is dormant, and one dashboard toggle away from working. That is fine
as a steady state for a private repo with zero forks; it is not the same as
done, and it should not be recorded as done.

**Disable first. Retire when you migrate to signing keys. Consider purging
history only if neither is possible.**

## How these got committed

Worth knowing, because the paths are still open:

- `.env.local` was tracked before `.gitignore` covered it. It is ignored now.
- `.next/` build output was committed, and `next build` inlines server env into
  the bundle — so the key landed in `.next/server/app/dashboard/page.js` as well
  as in `.env.local`. `.next` is ignored now.
- `audit_output.txt` was a one-off audit dump that quoted `.env.local` line by
  line. Untracked and ignored as of this change.

`scripts/scan-secrets.mjs` exits non-zero if a usable credential reappears in the
working tree. Wire it into CI or a pre-commit hook to keep it that way.
