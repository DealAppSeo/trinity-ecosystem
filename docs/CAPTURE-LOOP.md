# The capture loop — screenshot → tag → agent → a return worth having

**Status: DESIGN ONLY. Nothing here is built.** Written 2026-08-27 from Sean's observation.
Indexed in `PRIOR-WORK-INDEX.md` under OPEN so it does not become a document nobody opens —
which is, as it happens, the exact failure mode this design is about.

---

## The observation, stated precisely

Humans have muscle memory for repetitive actions and a dopamine loop that sustains it. Swiping
a feed costs nothing and returns something often enough to keep the thumb moving. Agents have
neither. That asymmetry is usually framed as a human weakness. **It is a capture channel nobody
is using.**

The idea pipeline today, for anyone watching a feed:

```
see something worth acting on
  → pause the video
  → switch apps
  → recall what it was
  → type it somewhere
  → lose the thread and the context
```

Call it forty seconds and a broken flow state. Most ideas do not survive it — they die at
*"I'll remember that,"* which is a lie the brain tells reliably.

```
see something worth acting on
  → screenshot
  → tag
  → back to the feed
```

Three seconds, and it **never leaves the feed**. This is not a better capture UI. It is the
difference between an idea being captured and an idea being lost, which is a difference in kind.

## What this is NOT

It is not "screenshot to AI." That exists, it is a commodity, and building it would be
building the least interesting half.

**The capture is the cheap half. The return is the product.** A screenshot pipeline attached
to an agent that produces nothing is a faster way to fill a drawer.

## The dopamine question, answered honestly

Sean's framing was exact: *"not just to make it addicting but for it to provide value."* That
distinction has a concrete design consequence.

Feed mechanics work on **variable reward with no substance** — the payoff is the anticipation,
and it works whether or not anything good arrives. That is precisely why it is corrosive, and
copying it here would be both wrong and, worse, unnecessary.

A capture loop has something feeds structurally do not: **the return is real.** You send a
screenshot; later, something you actually wanted comes back. That is not a slot machine, it is
a dumbwaiter. Which yields one rule:

> **Never fake the return.** No streaks, no "12 captures this week!", no badge for the act of
> capturing. The only reward is the agent coming back with something good.

The consequence is a feature, not a cost: **if the agent is bad, the loop correctly dies.** A
streak counter would keep a user capturing into a void and call the engagement a success — the
same "reporting success it has not earned" defect this codebase already names, wearing a
friendlier interface. The absence of vanity metrics is what keeps the loop honest about
whether the fulfilment half actually works.

## Why this ecosystem is the one that can build it

Anyone can ship capture. Nobody else can ship **the return arriving with a trust score.**

| layer | what it contributes |
|---|---|
| HAL | the returned research is verified, not asserted — a cross-provider quorum already runs |
| RepID | the agent that produced it gains or loses reputation on the outcome |
| TrustMarket | if your agent is bad at a tag, buy one that is better |
| x402 | the good agent gets paid per fulfilment, not per subscription |

The capture loop is also the input funnel that finally gives all four **volume**. Today they
are exercised by tests and demos. A person who captures ten things a day generates ten real
fulfilment decisions a day, each with a verifiable outcome. That is the corpus these primitives
have been waiting for.

## THE PREREQUISITE — measured, and it changes the sequencing

**`ai_dispatch` holds 43 messages. 0 have ever been read. 0 have ever been replied to.**
Measured 2026-08-26; spans 2026-04-04 → 2026-07-15, four distinct senders, with per-agent
inbox views (`v_cc_inbox`, `v_grok_inbox`, `v_gemini_inbox`) and `read_at` / `reply_at` /
`reply_from` columns already in place.

Somebody built a real mailbox, complete with read receipts. **Nobody has ever opened it.**

This is the same shape as every other defect this project has hit in the last week — the BYOK
bypass wired at one end, the HAL quorum reporting health while running on three of five
providers, an env var set under a misspelt name. A mechanism that exists, looks complete, and
does nothing.

**So building capture on top of today's inbox produces a 44th unread message — just faster,
and at volume.** The reader is not a nice-to-have alongside this design. It is this design's
load-bearing half, and it is the half that does not exist.

## Where and when to fold it in

**Not "between MVP and V1." This is what V1 is.**

- **MVP (true today):** the trust primitives work, keylessly. HAL verifies, RepID scores,
  the catalog reads without a key, the SDK quickstart runs in under five seconds.
- **V1:** *an agent does something useful with what you send it, and you can tell whether to
  trust the answer.*

The capture loop is V1's front door. The `ai_dispatch` reader is V1's spine. **They are one
piece of work,** and scheduling them separately is how the front door gets built onto a wall.

Suggested order, each step independently useful:

1. **A reader that closes the loop on one tag.** One agent, one tag (`#research`), reading
   `ai_dispatch`, writing `reply` + `reply_at`, stamping a RepID outcome. Success criterion is
   not "it runs" — it is **`ever_read > 0` and a human judging the reply worth having.**
2. **Capture ingress.** OS share sheet → an endpoint → an `ai_dispatch` row. Small, and only
   worth building once step 1 returns something.
3. **The tag vocabulary**, kept deliberately tiny — see below.
4. **Trust on the return.** The reply carries the HAL verdict and the responding agent's RepID.
   This is the differentiator and it should ship in V1, not after.
5. **Multi-agent routing.** A tag selects an agent; TrustMarket lets you swap it. V1.1.

## The tag vocabulary

Small on purpose. A capture that requires thought is a capture that does not happen — the
whole value is that it costs three seconds. Every tag must be answerable in one word while
still walking.

```
#research     find out about this, come back with sources
#options      find me three alternatives with tradeoffs
#add:<agent>  give this capability/idea to a named agent
#abtest:<x>   test this against x, report which won
#watch        tell me if this changes
```

Design constraints worth stating:

- **The tag is the whole instruction.** If a capture needs a paragraph, the loop has failed
  and the person should open a chat instead.
- **An untagged capture is valid** and means `#inbox` — sort it later. Requiring a tag at
  capture time reintroduces the friction this exists to remove.
- **Never add a tag without a reader for it.** A tag with no fulfilment is a promise the
  system cannot keep, and one broken promise teaches the user the whole loop is theatre.

## What NOT to build

- **No streaks, badges, or capture counts.** See above; this is the load-bearing omission.
- **No summarisation-only returns.** "Here is what that screenshot said" is worthless — the
  person just looked at it. The return must contain something they did not have.
- **No silent failure.** If nothing useful was found, the reply says so. `NOT_CHECKED` and
  `FAILED` are outcomes, and a loop that only ever reports success is the defect this
  project keeps re-encountering.
- **No OCR-first architecture.** The image plus the tag is the payload. Extracting text is one
  possible fulfilment strategy, not the contract.

## Open questions, honestly unresolved

- **Who reads the inbox, and where does it run?** Nothing today reads `ai_dispatch`. The
  runner would need scheduling, credentials, and a home. This is the largest unknown, and
  it is larger than it first looks: **the obvious home is not currently available.** The
  index entry `hal-volume-stopped-2026-07-17` records the Trinity fleet on Railway as
  stopped since 2026-07-17 22:18 UTC, root-caused as an operational outage awaiting a
  manual redeploy, with an XC re-measurement on 2026-08-17 still showing only the nightly
  smoke trickle. That is the last measurement in the index, **not a fresh reading** — but
  it means "we will run the reader on the existing fleet" is an assumption to re-verify
  before it is scheduled, not a given. Sequencing consequence: whoever picks up the reader
  should confirm a live host first, because a reader with no home leaves `ever_read` at
  zero for exactly the same reason the mailbox already sits unread.
- **What does a fulfilment cost, and who pays?** x402 makes per-fulfilment payment possible,
  but the free-tier arithmetic already established for HAL applies here too: an unbounded
  number of captures times a per-capture provider call is an unbounded bill.
- **Privacy.** Screenshots capture whatever was on the screen, including things the person
  did not mean to send. This needs a deliberate answer before ingress ships, not after.
- **Does the return actually get read?** The unfalsifiable risk is building a loop whose
  replies go as unread as the messages did. `ever_read` on the *reply* is the honest metric,
  and it should be instrumented from day one.
