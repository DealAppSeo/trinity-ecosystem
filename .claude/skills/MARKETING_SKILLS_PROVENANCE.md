# Marketing skills — provenance & review

These eight skills are vendored (copied + committed) so they reach **every Claude
surface** — cloud sessions clone this repo fresh, and XC/GA can read them via
`repo_read`. A machine-local `npx skills add` (which writes to `~/.claude/skills/`)
would reach none of them. In this repo, the commit *is* the install.

## Source
- **Repo:** https://github.com/coreyhaines31/marketingskills (MIT License)
- **Commit vendored from:** `3df87f97621e18fbed7f6aa684edba54f49779a7`
- **Vendored:** 2026-08-22

## What was taken, and why only these
The source has 49 skills. Only the ones that serve **TrustShell / TrustMarket
launch** work were kept — positioning, landing copy, SEO, CRO, growth:

| Skill | Serves |
|---|---|
| `product-marketing` | positioning / ICP context (other skills read `.agents/product-marketing.md`) |
| `copywriting` | landing / hero / pricing-page copy |
| `copy-editing` | tightening existing copy |
| `cro` | conversion-rate optimization |
| `launch` | launch playbook |
| `seo-audit` | SEO audit |
| `ai-seo` | answer-engine / AI-search optimization |
| `content-strategy` | growth content |

The other 41 (ads, cold-email, sms, influencer, etc.) were **not** taken — they are
not launch-critical and would be the wrong tenant here.

## Security review (2026-08-22)
A skill file is agent instructions, so each kept skill was read in full plus scanned
for the dangerous shapes: remote fetch, context exfiltration, check-bypass /
prompt-injection, embedded executables. **Verdict: clean.** All eight are
local-file-oriented (read the repo, write to `.agents/`); the only external URLs are
documentation citations (Google Rich Results, llmstxt.org, developer guides), not
fetch directives; the only non-markdown files are `evals/evals.json` test cases. No
code payloads. Popularity (45.2k stars) was treated as popularity, not provenance.
