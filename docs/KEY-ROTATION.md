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

**Unverified:** whether the legacy `service_role` JWT is still accepted by the
API. Secret keys are not readable through any Supabase API, and the PostgREST
host is proxy-denied from cloud sessions. Treat it as live until measured. Do
not let any doc claim otherwise without a measurement behind it — that claim was
made once already and was wrong.

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
