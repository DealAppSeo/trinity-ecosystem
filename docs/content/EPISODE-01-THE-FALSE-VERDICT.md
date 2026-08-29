# Episode 01 — The False Verdict

**Status: READY TO SHOOT. Every claim below is verified and linked.**
Written 2026-08-29, hours after the incident closed. Do not publish a word of it
without re-checking the two numbers in *Fact base* — they are live values.

---

## Why this is the first piece, and not a product explainer

Nobody needs another agent-infrastructure launch thread. What almost nobody in
this category will publish is a **verified account of their own system producing a
confident, false, economically-enforced verdict** — with the transaction hash where
it started working again.

That is the product thesis demonstrated rather than asserted. It is also the only
kind of content a trust company can post that a competitor cannot copy, because
copying it requires admitting something.

**The rule for this whole channel:** we publish the gap, not the average.

---

## Fact base — re-verify before publishing

| Claim | Value | How to re-check |
|---|---|---|
| Outage window | 2026-08-17 → 2026-08-29 | `service_contracts`, status by day |
| Consecutive disputed runs | 12 | rows with `dispute_verdict='provider_at_fault'` |
| Lifetime on-chain writes | **92** | `select count(*) from erc8004_reputation_writes` |
| Previous published figure | 70 (2026-07-08 snapshot) | superseded, not withdrawn |
| Recovery transaction | `0xdaf4863b…` | sepolia.basescan.org, 2026-08-29 12:01:34 UTC |
| Verdict before / after | FAIL @ conf 0 → **PASS @ conf 0.95** | `service_contracts.result` |

**If any of these moved, the script is wrong.** A piece about honest measurement
that ships a stale number would be the joke told at our expense.

---

## The 45-second cut

> **[HOOK — 0:00]**
> For thirteen days, our trust engine was lying. Confidently. And every dashboard
> was green.
>
> **[0:05]**
> Here's what it was saying: *this agent failed the job.* It docked its
> reputation. It refunded the buyer. Twelve days in a row.
>
> **[0:12]**
> The agent hadn't failed. Nobody had checked its work at all.
>
> **[0:16 — the cause]**
> A vendor renamed an AI model. Our validators called the old name and got a 404.
> Three silent validators. And our code scored silence as a zero.
>
> **[0:26 — the line that matters]**
> Zero isn't "bad." Zero is "we didn't look." We'd built a whole vocabulary for
> that distinction — and never wired it into the one place that spends money.
>
> **[0:34]**
> Fixed both halves. A validator that doesn't answer is now excluded, not counted
> against you.
>
> **[0:39 — proof]**
> That's the transaction. 12:01 UTC today. First on-chain attestation in thirteen
> days.
>
> **[0:43 — close]**
> We publish the gap, not the average. TrustShell.dev.

**Runtime:** ~45s. **Format:** 9:16. **Captions:** word-level, burned in.

---

## Hook variants — test these, don't guess

The hook is the only variable worth A/B testing at this follower count. Same body,
five openings:

1. **Confession.** *"For thirteen days, our trust engine was lying. Confidently."*
2. **Specific number.** *"Our AI penalised an innocent agent twelve days in a row.
   Here's the bug."*
3. **Universal.** *"A vendor renamed a model. It cost us thirteen days and a
   reputation that wasn't ours to spend."*
4. **Contrarian.** *"Every dashboard was green. The system was broken. Green
   dashboards are the problem."*
5. **Question.** *"What does your AI do when it can't check something? Ours called
   it a failure."*

Prediction, recorded so it can be wrong: **1 and 4 outperform.** 1 buys attention
with an admission, which is scarce. 4 attacks a belief the audience already half
holds. 2 and 5 are fine and safe. 3 is the weakest — it makes a vendor the
villain, which is both less true and less interesting than the real cause.

---

## The thread version

> Our trust engine spent 13 days publishing a confident, false verdict about an
> innocent agent.
>
> Every dashboard stayed green. Here's the whole thing 🧵
>
> —
>
> The setup: a daily job where one AI agent buys a verification service from
> another, pays in USDC, and the result gets written on-chain as portable
> reputation.
>
> It ran clean for months.
>
> —
>
> On Aug 17 it started failing. Not loudly. The money still moved. The contract
> still resolved.
>
> It just resolved as: *the provider is at fault.*
>
> Twelve days running.
>
> —
>
> The provider wasn't at fault. Three peer validators were supposed to check the
> work. All three errored — a vendor had retired the model they called.
>
> Our aggregator scored each silent validator as **zero**.
>
> —
>
> Three zeroes average to zero. Zero reads as "terrible work."
>
> So the system produced a damning verdict about work **nobody had assessed** —
> and charged reputation for it.
>
> —
>
> This is the failure we built the entire product to catch, living in our own
> economic core.
>
> We even had the vocabulary written down, for the UI:
>
> *"NOT_CHECKED renders neutral, not amber. Amber asserts something is wrong,
> which is a claim nobody measured."*
>
> —
>
> It had never reached the code that spends money.
>
> —
>
> Two fixes:
> • the model is configuration now, not a hardcoded string
> • a validator that doesn't answer is excluded from the score, not counted
>   against you
>
> Six tests pin it. We proved they fail by reverting the fix and watching them go
> red.
>
> —
>
> Today, 12:01 UTC — first on-chain attestation in 13 days.
>
> 0xdaf4863b… [link]
>
> —
>
> We updated our public count from 70 to 92 writes, and left the old number
> visible with the outage that sits between them.
>
> A trust protocol that reports only its good weeks is making the exact claim it
> exists to detect.
>
> —
>
> Building this in the open at TrustShell.dev.
>
> If you run agents that pay each other, the question isn't whether your system
> can be wrong. It's whether it can tell you it doesn't know.

---

## What NOT to say

- **Don't call it "a small bug."** It moved money and penalised an innocent party.
  Minimising it costs the credibility the piece is buying.
- **Don't blame the vendor.** They retired a model on a normal schedule. Our
  hardcoded string and our zero-scoring are what turned that into 13 days.
- **Don't imply this is now impossible.** It's fixed here. The class is not
  eliminated, and claiming it is would be the same species of overclaim.
- **Don't show a dashboard as evidence.** Green dashboards are the antagonist of
  this story. Show the transaction and the SQL.

---

## Follow-ons this unlocks

1. **"Three outcomes, never two"** — the vocabulary piece. VERIFIED / NOT_CHECKED /
   FAILED, and why two-state systems always lie in the same direction.
2. **"The check that caught itself, twice."** Our staleness gate went silent on the
   very document we'd just carefully verified — because the date was in bold.
   Same lesson, funnier, and it's already true.
3. **The mutual-rating build** — additive-only, no reversal. Film the design
   argument, not the feature.
