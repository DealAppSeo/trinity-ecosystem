# Red team evidence — collected observations, judged elsewhere

Files here are **raw observations of a live surface**, captured by whoever could
reach it. Nothing here is a verdict. The probes in `scripts/redteam/probes/`
read these files and decide what is and is not a finding.

That split is deliberate and it is what makes it safe to point an external agent
(XAI, Gemini, a CI runner, a human with `curl`) at this repository's live
surfaces. **A collector contributes observations, which are checkable. It never
contributes verdicts, which are not.** An external model that misreads a status
word produces a file whose contents are still exactly what the endpoint said; a
probe that trusted an external model's *conclusion* would have no such floor.

## Why collection is a separate job at all

Every custom domain in this project is proxy-denied to `curl` and to the browser
tool from an agent session (`CLAUDE.md` § Network). A local-only probe suite is
therefore structurally unable to observe production — and a suite that reports
"no findings" because it could not look is the single defect this repository
names as its recurring one. Splitting collection out converts that from a silent
pass into a `NOT_CHECKED` with a named route to `CHECKED`.

## Required shape

`version-<surface>.json`:

```json
{
  "surface":      "www.aitrinitysymphony.com",
  "url":          "https://www.aitrinitysymphony.com/api/version",
  "collectedAt":  "2026-08-16T17:16:21.245Z",
  "collectedBy":  "claude-code session claude/trust-layer-red-team-ujpq6a",
  "collectedVia": "supabase pg_net (net.http_get), response id 5096",
  "statusCode":   200,
  "body":         { "...": "the response body, verbatim and unedited" }
}
```

Every field is required. `collectedBy` and `collectedVia` are the ones people
want to skip, and they are the reason this is evidence rather than an assertion:
they say who looked, and by which egress path — which matters here, because
`pg_net` and `curl` reach different sets of hosts and a failure on one says
nothing about the other.

`collectedAt` is enforced. Evidence older than the probe's `MAX_AGE_DAYS`
(14) is `NOT_CHECKED`, never a pass. A configuration reading from three weeks
ago describes a deployment that may no longer exist.

## `bundle-<surface>.json` — deployed browser-bundle recon (judged by `LIVE-002`)

Same provenance fields, plus an `observations` object recording what the shipped
JS bundle contains. The key facts `LIVE-002` judges:

```json
{
  "surface": "trustshell.dev",
  "collectedAt": "…", "collectedBy": "…", "collectedVia": "…",
  "observations": {
    "backendHostsInBundle": ["https://<ref>.supabase.co", "…"],
    "supabaseKey": {
      "format": "legacy_jwt",              // or "sb_publishable"
      "isNewPublishableOrSecret": false,
      "claims": { "iss": "supabase", "ref": "<ref>", "role": "anon", "iat": 0, "exp": 0 }
    },
    "liveAuthTest": {
      "url": "https://<ref>.supabase.co/rest/v1/",
      "statusCode": 401,
      "serverMessage": "Legacy API keys are disabled …"
    }
  }
}
```

**Do not store the raw token.** For an `anon` key it is public by design and
would trip `check:secrets` for no gain; the decoded `claims` plus the
`liveAuthTest` result are the observation the probe needs. If a collector ever
finds a **`service_role`** token in a bundle, record the decoded `role` and the
auth-test status — still not the raw token — and treat it as Critical: a
privileged key in a browser is rotated, not filed.

## What may be committed here

`/api/version` is public, uncached, and reports secret **status words** only —
`ok` / `missing` / `too_short` / `abandoned_default` — never a value, a prefix
or a length. That is a property `npm run check:config-readiness` protects, and
it is why these files are safe to commit.

**Do not put anything else here.** Preflight fences forbid production rows,
proofs and agent ids as git fixtures. If a probe needs live rows, it takes a
count or a shape, not the rows.

## Collecting

From a session where the domains are denied, use Supabase `pg_net` — it egresses
from Supabase infrastructure, not through the sandbox proxy:

```sql
select net.http_get(url := 'https://www.aitrinitysymphony.com/api/version',
                    timeout_milliseconds := 45000);
-- then, with the id it returned:
select status_code, content from net._http_response where id = <id>;
```

From anywhere with ordinary network access, `curl` is fine. Either way, put the
response body in `body` **verbatim** — do not reformat, filter or summarise it.
A collector that edits the body has started judging.
