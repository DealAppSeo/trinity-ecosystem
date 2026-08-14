#!/usr/bin/env node
// scripts/harness-simulate.mjs — E2E simulation of the trust harness.
//
// Run: node scripts/harness-simulate.mjs [--tasks N] [--seed N] [--json]
//
// Measures the harness against a naive baseline on the same seeded workload, so
// every number below is a difference produced by the mechanisms rather than by
// luck. Both arms see an identical task stream and identical expert behaviour;
// only the routing and fault-tolerance layers differ.
//
// The baseline arm is deliberately modelled on what the surveyed frameworks
// actually do: greedy selection on a score, no rate limiting, no capacity
// governance, no breaker, no quorum, and — the important one — trust taken
// from the expert's own claim rather than from earned history.
//
// Deterministic: same seed, same numbers. The clock is virtual, so a run
// covering hours of simulated traffic completes in under a second.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TASKS = arg('tasks', 2000);
const SEED = arg('seed', 20260813);
const AS_JSON = argv.includes('--json');
// Ablation: run the harness arm with the timeout policy disabled, so a hang is
// bounded only by the outer run deadline exactly as it is for the baseline.
// This is the honest A/B for the timeout module specifically — comparing the
// full harness against the naive baseline conflates it with every other
// mechanism and would credit the timeout for wins it did not produce.
const NO_TIMEOUT = argv.includes('--no-timeout');
const PANEL_SIZE = arg('panel-size', 3);
// Wrong answers scatter (realistic) vs form an agreeing bloc (pessimistic).
// The headline panel number uses the bloc model deliberately.
const SCATTER_WRONG = argv.includes('--scatter-wrong');
// SHARED TASK DIFFICULTY — the assumption Sprint L rested on and did not test.
// At 0 (the default, and the published world) every task is identical and each
// expert's correctness is an independent coin flip, so a panel of 3 gets three
// independent draws. Real experts fail on the SAME hard tasks. This makes
// difficulty a per-task property all experts share, which correlates their
// errors through the task rather than through the answer key.
const HARDNESS_W = arg('hardness', 0);
// Restore the pre-2026-08-14 cold-start rule: a flat 0.5 trust weight for any
// cold expert, discarding whatever evidence it has already produced.
const COLD_MIDPOINT = argv.includes('--cold-start-midpoint');
// ESCALATION-SIGNAL ABLATION. Replaces the margin/earned/confidence decision
// with a coin flip at this rate, keeping every other mechanism identical.
//
// It exists to answer the question that has to come BEFORE tuning `marginFloor`:
// does the signal discriminate at all? A threshold is only worth choosing if
// the thing it thresholds beats picking tasks at random for the same spend.
// Note the signals `EscalationPolicy` reads — topEarned, runnerUpEarned,
// topConfidence — are all properties of the EXPERTS. None of them can see the
// task, so there is a real prior that they cannot predict which task is hard.
// -1 disables the ablation and uses the real policy.
const ESCALATE_RANDOM = arg('escalate-random', -1);


const { load } = compileHarness();
const { ManualClock } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { CircuitBreakerRegistry } = await load('circuit-breaker');
const { QuorumEvaluator } = await load('quorum');
const { ReputationLedger } = await load('reputation');
const { TimeoutPolicy } = await load('timeout');
const { ContextTransformer, approximateTokens } = await load('transform');
const { PluralityAggregator } = await load('aggregate');
const { EscalationPolicy } = await load('escalate');
const { AgreementTracker, AdaptivePanelPolicy } = await load('agreement');
// Drawn from a dedicated stream and shared by EVERY arm, so all arms see the
// identical difficulty sequence. Drawing it inside a world would give each arm
// a different one and make the comparison meaningless.
const HARDNESS = (() => {
  if (HARDNESS_W <= 0) return null;
  const r = new SeededRng(SEED ^ 0xd1ff);
  return Array.from({ length: TASKS }, () => r.next());
})();


// The run/idle split. IDLE is short because it measures time since the last
// observed progress; RUN has to be long enough for the slowest legitimate task,
// which is exactly why it is useless as a hang detector on its own.
const RUN_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 1_500;

// ── the simulated world ──────────────────────────────────────────────────────
//
// `trueQuality` is ground truth the harness cannot see. `claimedScore` is what
// an expert asserts about itself — the baseline trusts it; the harness ignores
// it. `degradesAt` silently multiplies latency and error rate partway through
// the run without the expert ever crashing.

/**
 * Ground-truth quality actually delivered across the whole run.
 *
 * The nominal `trueQuality` is not what an expert delivers if it degrades or
 * fails partway through. Ranking the harness against the nominal figure scored
 * it DOWN for correctly detecting `decayer`'s collapse — the metric was wrong,
 * not the harness. This computes the time-weighted effective quality instead.
 */
function effectiveQuality(e) {
  const degradeFrom = e.degradesAt ?? 1;
  const failFrom = e.failsAt ?? 1;
  const hangFrom = e.hangsAt ?? 1;
  const cut = Math.min(degradeFrom, failFrom, hangFrom);
  const healthyShare = cut;
  const rest = 1 - cut;
  const healthyDelivered = e.trueQuality * (1 - e.errorRate);

  // Degraded: quality * 0.4 and 10x errors. Failing: nothing succeeds at all.
  // Hanging: the `hangRate` share of calls returns nothing at all, so the
  // expert delivers only on the remainder.
  //
  // The hang term is NOT optional bookkeeping. Adding a hanging expert without
  // it would rank the harness against a quality the expert never delivered,
  // scoring it DOWN for correctly demoting a staller — the identical wrong-
  // metric defect that produced the spurious tau 0.333 earlier today.
  let restQuality;
  if (e.failsAt !== undefined && failFrom <= degradeFrom && failFrom <= hangFrom) {
    restQuality = 0;
  } else if (e.hangsAt !== undefined && hangFrom <= degradeFrom && hangFrom <= failFrom) {
    restQuality = healthyDelivered * (1 - e.hangRate);
  } else {
    restQuality = e.trueQuality * 0.4;
  }

  return healthyShare * healthyDelivered + rest * restQuality;
}

const EXPERTS = [
  { id: 'alpha',   caps: ['hal'], trueQuality: 0.92, baseLatency: 120, errorRate: 0.02, claimedScore: 7000, capacity: 400 },
  { id: 'bravo',   caps: ['hal'], trueQuality: 0.88, baseLatency: 150, errorRate: 0.03, claimedScore: 6500, capacity: 400 },
  { id: 'charlie', caps: ['hal'], trueQuality: 0.85, baseLatency: 180, errorRate: 0.04, claimedScore: 6000, capacity: 400 },
  // Claims to be the best and is the worst. The baseline routes to it heavily.
  { id: 'boaster', caps: ['hal'], trueQuality: 0.35, baseLatency: 110, errorRate: 0.25, claimedScore: 10000, capacity: 400 },
  // Silently degrades at 40% through the run: 6x latency, 10x errors, no crash.
  { id: 'decayer', caps: ['hal'], trueQuality: 0.90, baseLatency: 130, errorRate: 0.02, claimedScore: 7000, capacity: 400, degradesAt: 0.4 },
  // Hard-fails from 60% onward. The breaker should isolate it.
  { id: 'crasher', caps: ['hal'], trueQuality: 0.80, baseLatency: 140, errorRate: 0.03, claimedScore: 6800, capacity: 400, failsAt: 0.6 },
  // Genuinely excellent, but unknown. Cold-start handling decides whether it
  // is ever discovered.
  { id: 'rookie',  caps: ['hal'], trueQuality: 0.95, baseLatency: 100, errorRate: 0.01, claimedScore: 0,    capacity: 400, cold: true },
  // HANGS from 50% onward, half its calls, and never errors while doing it.
  // Invisible to the breaker (no failure), to the capacity governor (no
  // completion, so no latency sample) and to the ledger (no outcome). It claims
  // 9000 so the baseline — which believes claims — actually routes to it.
  { id: 'stalled', caps: ['hal'], trueQuality: 0.85, baseLatency: 160, errorRate: 0.03, claimedScore: 9000, capacity: 400, hangsAt: 0.5, hangRate: 0.5 },
];

const FALLBACK_QUALITY = 0.6; // generalist used when a breaker is open

/**
 * Probability this expert returns a CORRECT answer to a call made right now.
 *
 * `effectiveQuality` above averages over the whole run, which is the right
 * thing for ranking but the wrong thing for asking "who was the best choice at
 * this moment". This is the instantaneous version, and it is what an omniscient
 * router would maximise.
 */
function instantQuality(e, progress) {
  if (e.failsAt !== undefined && progress >= e.failsAt) return 0;
  const degraded = e.degradesAt !== undefined && progress >= e.degradesAt;
  const errorRate = Math.min(1, e.errorRate * (degraded ? 10 : 1));
  const quality = degraded ? e.trueQuality * 0.4 : e.trueQuality;
  const delivered = (1 - errorRate) * quality;
  // A hang returns nothing at all, so that share of calls delivers zero.
  if (e.hangsAt !== undefined && progress >= e.hangsAt) return delivered * (1 - e.hangRate);
  return delivered;
}

const bestExpertAt = (progress) =>
  EXPERTS.reduce((a, b) => (instantQuality(b, progress) > instantQuality(a, progress) ? b : a));

function makeWorld(seed) {
  const rng = new SeededRng(seed);
  return {
    rng,
    /** Simulate one call. Returns latency, success, and ground-truth correctness. */
    call(expert, progress, hardness = 0.5) {
      const degraded = expert.degradesAt !== undefined && progress >= expert.degradesAt;
      const failing = expert.failsAt !== undefined && progress >= expert.failsAt;

      // A hang is not an error and not a slow success — it is the absence of
      // any signal at all. The call simply never comes back, so `ok`,
      // `correct` and `latencyMs` are all meaningless and the caller must
      // discover it by deadline or not at all.
      if (expert.hangsAt !== undefined && progress >= expert.hangsAt && rng.next() < expert.hangRate) {
        return { latencyMs: 0, ok: false, correct: false, hang: true };
      }

      const latency = failing
        ? expert.baseLatency * 0.5
        : expert.baseLatency * (degraded ? 6 : 1) * (0.8 + rng.next() * 0.4);

      const errorRate = failing ? 1.0 : expert.errorRate * (degraded ? 10 : 1);
      const ok = rng.next() > errorRate;
      const base = degraded ? expert.trueQuality * 0.4 : expert.trueQuality;
      // Symmetric around 0.5 so the MEAN quality is unchanged; only the
      // variance across tasks rises. A harder-than-average task lowers every
      // expert's chance at once, which is exactly the correlation being tested.
      const quality = Math.max(0, Math.min(1, base + HARDNESS_W * (0.5 - hardness) * 2));
      const correct = ok && rng.next() < quality;

      return { latencyMs: Math.round(latency), ok, correct, hang: false };
    },
  };
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/** Gini coefficient of the load distribution. 0 = perfectly even, 1 = all on one. */
function gini(counts) {
  const xs = [...counts].sort((a, b) => a - b);
  const n = xs.length;
  const total = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || total === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function emptyMetrics() {
  return {
    completed: 0,
    correct: 0,
    failed: 0,
    unroutable: 0,
    viaFallback: 0,
    latencies: [],
    perExpert: new Map(EXPERTS.map((e) => [e.id, 0])),
    callsToDegraded: 0,
    callsToCrasher: 0,
    rookieCalls: 0,
    hangsHit: 0,
    hangStallMs: 0,
    hangsByIdle: 0,
    hangsByRun: 0,
    abortsLanded: 0,
    firstPicks: 0,
    pickedBest: 0,
    panelCalls: 0,
    escalated: 0,
    screenedOut: 0,
  };
}

// ── arm 1: naive baseline ────────────────────────────────────────────────────
//
// Greedy top-1 on self-claimed score. No limiter, no capacity, no breaker, no
// quorum, no cold-start exploration. One retry on error, to be fair to it.

function runBaseline(seed) {
  const world = makeWorld(seed);
  const m = emptyMetrics();

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    // Rank purely by the expert's own claim — the defect being measured.
    const ranked = [...EXPERTS].sort((a, b) => b.claimedScore - a.claimedScore);

    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt += 1) {
      const expert = ranked[attempt];
      if (!expert) break;
      const r = world.call(expert, progress, HARDNESS ? HARDNESS[i] : 0.5);
      m.perExpert.set(expert.id, m.perExpert.get(expert.id) + 1);
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (expert.id === 'rookie') m.rookieCalls += 1;

      if (r.hang) {
        // The baseline has no idle deadline, so a hang is only ever bounded by
        // the outer run deadline. It is GENEROUS to credit it with even that —
        // a caller with no timeout mechanism at all never returns. The stall is
        // charged as latency and the attempt is consumed.
        m.hangsHit += 1;
        m.hangStallMs += RUN_TIMEOUT_MS;
        m.latencies.push(RUN_TIMEOUT_MS);
        continue;
      }
      m.latencies.push(r.latencyMs);

      if (r.ok) {
        m.completed += 1;
        if (r.correct) m.correct += 1;
        done = true;
      }
    }
    if (!done) m.failed += 1;
  }

  return m;
}

// ── arm 2: full harness ──────────────────────────────────────────────────────

function runHarness(seed, panel = null) {
  const world = makeWorld(seed);
  const clock = new ManualClock(0);
  const m = emptyMetrics();

  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 600 });
  for (const e of EXPERTS) limiter.configure(e.id, { tokensPerMinute: e.capacity });

  const capacity = new CapacityGovernor(clock, {
    baseSlots: 6,
    minSlots: 1,
    maxSlots: 12,
    warmupSamples: 5,
    degradedRatio: 1.5,
    alpha: 0.3,
  });

  const breakers = new CircuitBreakerRegistry(clock, {
    thresholdFailures: 3,
    resetTimeoutMs: 30_000,
    successesToClose: 2,
  });

  const timeouts = new TimeoutPolicy(clock, {
    runTimeoutMs: RUN_TIMEOUT_MS,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
  });

  const router = new TrustRouter(
    clock,
    limiter,
    capacity,
    {
      explorationRate: 0.12,
      congestionWeight: 0.9,
      trustFloor: 2000,
      alternatesCount: Math.max(3, PANEL_SIZE + 1),
      // Ablation seam for the 2026-08-14 cold-start change. `--cold-start-midpoint`
      // restores the flat 0.5, so the A/B can be re-run rather than trusted.
      coldStartWeighting: COLD_MIDPOINT ? 'midpoint' : 'earned',
    },
    new SeededRng(seed ^ 0x5eed)
  );

  // Panel machinery. Null unless this arm is the aggregating one, so the
  // top-1 arm is byte-for-byte the run it was before.
  const plurality = panel ? new PluralityAggregator(clock, { minProposals: 2 }) : null;
  // Only the panel arm can feed this: a pair is measurable only on tasks where
  // BOTH experts were called, which a top-1 router never does.
  const agreement = panel ? new AgreementTracker({ minCoObservations: 50 }) : null;
  // Adaptive arm only: learns from measured uplift whether panels pay here.
  const panelPolicy =
    panel && panel.adaptive ? new AdaptivePanelPolicy(agreement, panel.adaptive) : null;
  const escalation = panel ? new EscalationPolicy(clock, panel.escalateCfg ?? {}) : null;
  const escalateRng = new SeededRng(seed ^ 0xe5ca1a);

  // Earned reputation, learned from observed outcomes. Confidence-weighted:
  // an expert's score is shrunk toward the neutral prior in proportion to how
  // little evidence stands behind it. Added after the first simulation run
  // scored Kendall tau 0.429 because a lucky 15-observation streak outranked a
  // 757-observation track record.
  const ledger = new ReputationLedger({ prior: 5000, alpha: 0.06, confidenceK: 20, coldStartConfidence: 0.5 });
  const updateEarned = (id, good) => ledger.record(id, good);

  const profiles = () =>
    EXPERTS.map((e) => ({
      id: e.id,
      capabilities: e.caps,
      // Rank on the UPPER CONFIDENCE BOUND, not the point estimate. Both are
      // ledger-derived; the UCB adds a bonus proportional to what we do not
      // yet know, which decays smoothly to zero as evidence accumulates. This
      // is what removes the cold-start cliff: with a binary flag, experts
      // pinned at exactly the graduation threshold and never advanced.
      earnedScore: ledger.upperConfidenceBound(e.id, 2500),
      perceivedScore: e.claimedScore, // carried, never ranked on
      coldStart: ledger.isColdStart(e.id),
      // Supplied so the router can distinguish "no evidence" from "thin
      // evidence". Without it the router must stay conservative and never rank
      // a cold expert below the midpoint, which discards every failing
      // observation an expert makes before it graduates. See router.ts.
      observations: ledger.observations(e.id),
    }));

  // Abandoned calls we have stopped waiting for but cannot prove are dead.
  // The transport is modelled as taking a grace period to land an abort; until
  // it does, the slot stays stranded and the expert is not handed more work.
  const pendingAborts = [];
  const ABORT_GRACE_MS = IDLE_TIMEOUT_MS * 2;

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    clock.advance(100); // virtual arrival interval

    // Land any aborts whose grace period has elapsed. Reclaiming on a schedule
    // the CALLER owns, rather than inside the governor, is deliberate: the
    // governor must never invent a grace period it cannot observe.
    while (pendingAborts.length > 0 && pendingAborts[0].at <= clock.now()) {
      const done = pendingAborts.shift();
      capacity.reclaim(done.expert);
      timeouts.settle(done.attemptId, 'confirmed_dead');
      m.abortsLanded += 1;
    }

    const task = { id: `t${i}`, requires: ['hal'], estimatedTokens: 1 };
    const tried = [];
    let done = false;

    // ── PANEL PATH ───────────────────────────────────────────────────────────
    //
    // Only reached when this arm was constructed with a panel config. The
    // ceiling section at the bottom of this file is why it exists: an
    // omniscient TOP-1 router tops out at ~94.2% on this world, and the top-1
    // harness already reaches ~97.9% of that bound. The remaining ~5.9% is the
    // best available expert simply being wrong, which no amount of CHOOSING can
    // fix. Combining several experts is the only mechanism that can cross it.
    //
    // Escalation decides when it is worth paying for. Both signals it reads are
    // ledger-derived and already computed, so screening costs nothing.
    if (panel) {
      const d = router.route(task, profiles(), { isCircuitOpen: (id) => breakers.isOpen(id) });
      if (d.selected) {
        const members = [d.selected, ...d.alternates].slice(0, panel.panelSize);
        const dec = escalation.decide({
          topEarned: ledger.earnedScore(d.selected),
          runnerUpEarned: d.alternates.length > 0 ? ledger.earnedScore(d.alternates[0]) : undefined,
          topConfidence: ledger.confidence(d.selected),
        });
        // Two gates, and they answer different questions. Escalation asks "is
        // THIS task uncertain enough to be worth a panel". The adaptive policy
        // asks "do panels pay AT ALL in this fleet" — a property of the
        // deployment, learned from what panels have actually bought. A fleet
        // whose experts fail together needs the second gate; no amount of
        // per-task uncertainty makes a panel useful there.
        const worthIt = panelPolicy === null ? { panel: true } : panelPolicy.decide();
        // Ablation seam: same budget, no signal. Drawn from a dedicated stream
        // so switching it on cannot shift any other random draw in the run.
        const wantsPanel = ESCALATE_RANDOM >= 0 ? escalateRng.next() < ESCALATE_RANDOM : dec.escalate;
        if (wantsPanel && worthIt.panel && members.length >= 2) {
          const proposals = [];
          let slowest = 0;
          for (const id of members) {
            const expert = EXPERTS.find((e) => e.id === id);
            limiter.tryConsume(id, 1);
            capacity.acquire(id);
            const h = timeouts.begin(id, task.id);
            const r = world.call(expert, progress, HARDNESS ? HARDNESS[i] : 0.5);
            m.perExpert.set(id, m.perExpert.get(id) + 1);
            m.panelCalls += 1;
            if (id === 'rookie') m.rookieCalls += 1;
            if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
            if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;

            if (r.hang) {
              // A panel member that hangs contributes no proposal. The panel
              // pays the idle deadline because it waits for the slowest member.
              m.hangsHit += 1;
              clock.advance(IDLE_TIMEOUT_MS);
              slowest = Math.max(slowest, IDLE_TIMEOUT_MS);
              for (const e of timeouts.sweep()) {
                if (e.kind === 'idle') m.hangsByIdle += 1;
                else m.hangsByRun += 1;
                m.hangStallMs += e.elapsedMs;
                capacity.strand(e.attempt.expert);
                capacity.observe(e.attempt.expert, e.elapsedMs, false);
                breakers.recordFailure(e.attempt.expert);
                updateEarned(e.attempt.expert, false);
                pendingAborts.push({
                  expert: e.attempt.expert,
                  attemptId: e.attempt.id,
                  at: clock.now() + ABORT_GRACE_MS,
                });
              }
              continue;
            }

            timeouts.complete(h.id);
            capacity.release(id);
            capacity.observe(id, r.latencyMs, r.ok);
            slowest = Math.max(slowest, r.latencyMs);
            if (r.ok) {
              breakers.recordSuccess(id);
              updateEarned(id, r.correct);
              // CONSERVATIVE BY DEFAULT. `wrong` as a single key means every
              // wrong answer AGREES, forming a bloc that can out-vote the one
              // correct answer. Reality is the opposite — there are many ways
              // to be wrong and one way to be right — so this UNDERSTATES the
              // panel. `--scatter-wrong` measures the realistic model; the
              // headline uses the pessimistic one on purpose.
              const key = r.correct ? 'right' : SCATTER_WRONG ? `wrong:${id}` : 'wrong';
              proposals.push({ expert: id, key, answer: key, earnedScore: ledger.earnedScore(id) });
            } else {
              breakers.recordFailure(id);
              updateEarned(id, false);
            }
          }

          // One call per TASK with every observation together — the task
          // boundary is the whole quantity of interest and is unrecoverable if
          // outcomes are fed one at a time.
          agreement.recordTask(
            proposals.map((pr) => ({ expert: pr.expert, correct: pr.key === 'right' }))
          );

          // A panel pays its SLOWEST member, not the sum: the calls are
          // concurrent. Charging the sum would invent a cost the design avoids.
          m.latencies.push(slowest || 200);
          m.escalated += 1;

          if (proposals.length === 0) {
            m.failed += 1;
            continue;
          }
          // ATTRIBUTION ABLATION. A panel gathers panelSize observations per
          // task instead of one, so its ledger is better informed and routes
          // better — independently of any aggregation. With `aggregate: false`
          // the panel is still CALLED and still teaches the ledger, but the
          // answer taken is the leader's alone. Whatever that arm gains is the
          // extra-evidence effect; only the remainder belongs to aggregation.
          if (panel.aggregate === false) {
            const lead = proposals.find((pr) => pr.expert === members[0]) ?? proposals[0];
            m.completed += 1;
            if (lead.key === 'right') m.correct += 1;
            continue;
          }
          const a = plurality.aggregate(proposals);
          // The leader's own proposal is already in hand, so measuring what the
          // panel bought costs nothing extra and needs no counterfactual re-run.
          const leadProp = proposals.find((pr) => pr.expert === members[0]);
          const panelRight = a.outcome === 'DECIDED' && a.key === 'right';
          if (leadProp) agreement.recordPanelOutcome(leadProp.key === 'right', panelRight);
          m.completed += 1;
          if (panelRight) m.correct += 1;
          continue;
        }
        // Not escalated: fall through to the ordinary top-1 path below.
        m.screenedOut += 1;
      }
    }

    // Up to three attempts, walking the router's ranked alternates.
    for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
      const decision = router.route(task, profiles(), {
        exclude: tried,
        isCircuitOpen: (id) => breakers.isOpen(id),
      });

      if (!decision.selected) {
        // Every expert is unavailable. A generalist fallback keeps the request
        // alive, and is recorded as a fallback rather than as an expert win.
        const correct = world.rng.next() < FALLBACK_QUALITY;
        m.completed += 1;
        m.viaFallback += 1;
        if (correct) m.correct += 1;
        m.latencies.push(200);
        done = true;
        break;
      }

      const id = decision.selected;
      const expert = EXPERTS.find((e) => e.id === id);
      tried.push(id);

      limiter.tryConsume(id, 1);
      capacity.acquire(id);
      const attempt = timeouts.begin(id, task.id);
      const r = world.call(expert, progress, HARDNESS ? HARDNESS[i] : 0.5);

      // `tried` already holds this pick, so length 1 means it is the first.
      // NOT `attempt === 0`: the loop variable is shadowed a few lines above by
      // the AttemptHandle from timeouts.begin(), so that comparison is always
      // false and silently reported 0/0.
      if (tried.length === 1) {
        m.firstPicks += 1;
        if (id === bestExpertAt(progress).id) m.pickedBest += 1;
      }
      m.perExpert.set(id, m.perExpert.get(id) + 1);
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (id === 'rookie') m.rookieCalls += 1;

      if (r.hang && NO_TIMEOUT) {
        // No idle deadline: the hang is bounded only by the run deadline, and
        // because nothing ever completes there is no failure to record. The
        // breaker, the capacity governor and the ledger all learn nothing.
        m.hangsHit += 1;
        m.hangStallMs += RUN_TIMEOUT_MS;
        m.latencies.push(RUN_TIMEOUT_MS);
        clock.advance(RUN_TIMEOUT_MS);
        capacity.release(id);
        continue;
      }

      if (r.hang) {
        // No heartbeat ever arrives, so the idle deadline is what fires. Time
        // genuinely passes while the caller waits for it — the detection is
        // not free, and charging it here is what keeps the latency figures
        // honest rather than flattering.
        m.hangsHit += 1;
        clock.advance(IDLE_TIMEOUT_MS);
        const expired = timeouts.sweep();

        for (const e of expired) {
          // NOT release. We stopped waiting; the expert did not stop working.
          // Releasing here is the phantom slot — see capacity.ts.
          capacity.strand(e.attempt.expert);
          if (e.kind === 'idle') m.hangsByIdle += 1;
          else m.hangsByRun += 1;
          m.hangStallMs += e.elapsedMs;
          m.latencies.push(e.elapsedMs);
          // The signal the other layers could not otherwise obtain.
          capacity.observe(e.attempt.expert, e.elapsedMs, false);
          breakers.recordFailure(e.attempt.expert);
          updateEarned(e.attempt.expert, false);
          pendingAborts.push({
            expert: e.attempt.expert,
            attemptId: e.attempt.id,
            at: clock.now() + ABORT_GRACE_MS,
          });
        }
        continue;
      }

      // A completed call closes its attempt, so it can never be swept as a
      // hang. The clock is deliberately NOT advanced by the call duration:
      // the pre-existing 100ms arrival interval is left exactly as it was so
      // this run differs from the last one in the hang path alone, and the
      // delta is attributable to the mechanism rather than to a retimed world.
      timeouts.complete(attempt.id);
      capacity.release(id);

      capacity.observe(id, r.latencyMs, r.ok);
      m.latencies.push(r.latencyMs);

      if (r.ok) {
        breakers.recordSuccess(id);
        updateEarned(id, r.correct);
        m.completed += 1;
        if (r.correct) m.correct += 1;
        done = true;
      } else {
        breakers.recordFailure(id);
        updateEarned(id, false);
      }

      // A degraded expert loses slots via the governor; also fold the signal
      // into earned reputation so routing reacts before the breaker trips.
      if (capacity.health(id) === 'degraded') updateEarned(id, false);
    }

    if (!done) m.failed += 1;
  }

  return { m, ledger, breakers, capacity, timeouts, agreement, panelPolicy };
}

// ── run and report ───────────────────────────────────────────────────────────

const baseline = runBaseline(SEED);
const { m: harness, ledger, breakers, capacity, timeouts } = runHarness(SEED);
// Third arm: same harness, plus escalation-gated plurality aggregation. Built
// because the ceiling analysis at the bottom showed top-1 has ~2pp left and
// aggregation is the only mechanism that can cross the single-expert bound.
const PANEL_CFG = { panelSize: PANEL_SIZE, escalateCfg: { marginFloor: arg('margin-floor', 2000) } };
const { m: panelArm, agreement: panelAgreement } = runHarness(SEED, PANEL_CFG);
// Fourth arm: the panel, gated on whether panels have measurably paid here.
const ADAPTIVE_CFG = {
  ...PANEL_CFG,
  adaptive: { warmupPanels: 150, minUpliftPp: 0.5, explorationRate: 0.05 },
};
const { m: adaptiveArm, agreement: adaptiveAgreement, panelPolicy: adaptivePolicy } =
  runHarness(SEED, ADAPTIVE_CFG);
const { m: evidenceArm } = runHarness(SEED, { ...PANEL_CFG, aggregate: false });

const summarise = (m) => {
  const counts = [...m.perExpert.values()];
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    tasks: TASKS,
    completed: m.completed,
    completionRate: m.completed / TASKS,
    correct: m.correct,
    correctnessRate: m.correct / TASKS,
    failed: m.failed,
    viaFallback: m.viaFallback,
    totalCalls: total,
    callsPerTask: total / TASKS,
    p50LatencyMs: percentile(m.latencies, 50),
    p95LatencyMs: percentile(m.latencies, 95),
    p99LatencyMs: percentile(m.latencies, 99),
    loadGini: gini(counts),
    maxExpertShare: total === 0 ? 0 : Math.max(...counts) / total,
    hangsHit: m.hangsHit,
    hangStallMs: m.hangStallMs,
    hangsByIdle: m.hangsByIdle,
    hangsByRun: m.hangsByRun,
    meanHangDetectMs: m.hangsHit === 0 ? 0 : m.hangStallMs / m.hangsHit,
    callsToDegradedExpert: m.callsToDegraded,
    callsToCrashedExpert: m.callsToCrasher,
    rookieCalls: m.rookieCalls,
    perExpert: Object.fromEntries(m.perExpert),
  };
};

const b = summarise(baseline);
const h = summarise(harness);

if (AS_JSON) {
  console.log(JSON.stringify({ seed: SEED, tasks: TASKS, baseline: b, harness: h }, null, 2));
  process.exit(0);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const delta = (bv, hv, invert = false) => {
  if (bv === 0) return hv === 0 ? '0' : 'n/a';
  const change = ((hv - bv) / Math.abs(bv)) * 100;
  const better = invert ? change < 0 : change > 0;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% ${better ? '✓' : '✗'}`;
};

const row = (label, bv, hv, fmt = (x) => String(x), invert = false) =>
  `${label.padEnd(30)} ${fmt(bv).padStart(12)} ${fmt(hv).padStart(12)}   ${delta(bv, hv, invert)}`;

console.log(`\nTrustShell harness — E2E simulation`);
console.log(`seed=${SEED}  tasks=${TASKS}  experts=${EXPERTS.length}\n`);
console.log(`${''.padEnd(30)} ${'baseline'.padStart(12)} ${'harness'.padStart(12)}   delta`);
console.log('-'.repeat(76));
console.log(row('correct answers', b.correct, h.correct));
console.log(row('correctness rate', b.correctnessRate, h.correctnessRate, pct));
console.log(row('completion rate', b.completionRate, h.completionRate, pct));
console.log(row('unrecovered failures', b.failed, h.failed, (x) => String(x), true));
console.log(row('calls per task', b.callsPerTask, h.callsPerTask, (x) => x.toFixed(2), true));
console.log(row('p50 latency (ms)', b.p50LatencyMs, h.p50LatencyMs, (x) => String(x), true));
console.log(row('p95 latency (ms)', b.p95LatencyMs, h.p95LatencyMs, (x) => String(x), true));
console.log(row('p99 latency (ms)', b.p99LatencyMs, h.p99LatencyMs, (x) => String(x), true));
console.log(row('load Gini (0=even)', b.loadGini, h.loadGini, (x) => x.toFixed(3), true));
console.log(row('max single-expert share', b.maxExpertShare, h.maxExpertShare, pct, true));
console.log(row('calls to degraded expert', b.callsToDegradedExpert, h.callsToDegradedExpert, (x) => String(x), true));
console.log(row('calls to crashed expert', b.callsToCrashedExpert, h.callsToCrashedExpert, (x) => String(x), true));
console.log(row('calls to cold-start rookie', b.rookieCalls, h.rookieCalls));
console.log(row('hangs encountered', b.hangsHit, h.hangsHit, (x) => String(x), true));
console.log(row('mean hang detection (ms)', b.meanHangDetectMs, h.meanHangDetectMs, (x) => x.toFixed(0), true));
console.log(row('wall clock lost to hangs (s)', b.hangStallMs / 1000, h.hangStallMs / 1000, (x) => x.toFixed(1), true));

console.log(`\nLoad distribution (calls per expert)`);
console.log('-'.repeat(76));
for (const e of EXPERTS) {
  const bar = (n, total) => '█'.repeat(Math.round((n / Math.max(1, total)) * 40));
  console.log(
    `  ${e.id.padEnd(9)} q=${e.trueQuality.toFixed(2)} claim=${String(e.claimedScore).padStart(5)}  ` +
      `baseline ${String(b.perExpert[e.id]).padStart(5)}  harness ${String(h.perExpert[e.id]).padStart(5)}  ${bar(h.perExpert[e.id], h.totalCalls)}`
  );
}

console.log(`\nHang detection (the run/idle split)`);
console.log('-'.repeat(76));
console.log(`  baseline: no idle deadline. ${b.hangsHit} hang(s), each bounded only by the`);
console.log(`            ${RUN_TIMEOUT_MS}ms run deadline it is GENEROUSLY credited with but does not implement.`);
console.log(`  harness:  ${h.hangsHit} hang(s) — ${h.hangsByIdle} caught by the idle deadline, ${h.hangsByRun} by the run deadline.`);
console.log(`            mean detection ${h.meanHangDetectMs.toFixed(0)}ms vs ${b.meanHangDetectMs.toFixed(0)}ms, a ${(b.meanHangDetectMs / Math.max(1, h.meanHangDetectMs)).toFixed(1)}x faster stall.`);
console.log(`  attempts still in flight at end of run: ${timeouts.inFlight()} (a leak would show here)`);
console.log(
  `  abandoned attempts: ${harness.abortsLanded} settled as confirmed_dead, ` +
    `${timeouts.unsettledCount()} still unaccounted for (a leak would show here too)`
);
console.log(
  `  stranded slots at end of run: ${EXPERTS.reduce((n, e) => n + capacity.stranded(e.id), 0)}` +
    ` — a slot we stopped waiting on but never confirmed free. Never released on a`
);
console.log(
  `  timeout: giving up on a call does not stop the expert running it, and handing`
);
console.log(`  that slot back is how a hung expert keeps being sent work.`);

// ── context-bloat measurement ────────────────────────────────────────────────
//
// The routing arms above have no message dimension, so they cannot say anything
// about `transform.ts`. This is a SEPARATE measurement on its own model: a
// conversation that grows for TURNS turns, with a pinned system prompt and
// tool-call pairs, measured with and without the transform. It does not touch
// the routing simulation — those numbers are unchanged by construction.

function runContextBloat(seed) {
  const rng = new SeededRng(seed ^ 0xc0ffee);
  const TURNS = 400;
  const BUDGET = 4000;

  const messages = [
    { id: 'sys', role: 'system', content: 'S'.repeat(600 * 4), pinned: true },
  ];
  const transformer = new ContextTransformer(
    new ManualClock(0),
    { maxTokens: BUDGET, headKeep: 2, tailKeep: 6 },
    approximateTokens
  );

  let peakUntransformed = 0;
  let peakTransformed = 0;
  let sumUntransformed = 0;
  let sumTransformed = 0;
  let ratioSum = 0;
  let overBudget = 0;
  let pairsSplit = 0;
  let pinnedLost = 0;
  let lastDropped = 0;
  let lastKept = 0;
  let totalMessages = 0;

  for (let t = 0; t < TURNS; t += 1) {
    const size = 40 + Math.floor(rng.next() * 160);
    messages.push({ id: `u${t}`, role: 'user', content: 'u'.repeat(size * 4) });
    // Every third turn is a tool call plus its result, sharing a pairId.
    if (t % 3 === 0) {
      messages.push({ id: `c${t}`, role: 'assistant', content: 'c'.repeat(30 * 4), pairId: `p${t}` });
      messages.push({ id: `r${t}`, role: 'tool', content: 'r'.repeat(90 * 4), pairId: `p${t}` });
    } else {
      messages.push({ id: `a${t}`, role: 'assistant', content: 'a'.repeat(size * 4) });
    }

    const res = transformer.transform(messages);
    sumUntransformed += res.originalTokens;
    sumTransformed += res.retainedTokens;
    ratioSum += res.compressionRatio;
    peakUntransformed = Math.max(peakUntransformed, res.originalTokens);
    peakTransformed = Math.max(peakTransformed, res.retainedTokens);
    lastDropped = res.droppedIds.length;
    lastKept = res.messages.length;
    totalMessages = messages.length;
    if (!res.withinBudget) overBudget += 1;

    // Integrity invariants, checked on every single turn rather than asserted.
    const kept = new Set(res.messages.map((m) => m.id));
    if (!kept.has('sys')) pinnedLost += 1;
    const byPair = new Map();
    for (const m of messages) {
      if (m.pairId === undefined) continue;
      if (!byPair.has(m.pairId)) byPair.set(m.pairId, []);
      byPair.get(m.pairId).push(kept.has(m.id));
    }
    for (const flags of byPair.values()) {
      if (flags.some(Boolean) && !flags.every(Boolean)) pairsSplit += 1;
    }
  }

  return {
    turns: TURNS, budget: BUDGET,
    peakUntransformed, peakTransformed,
    meanUntransformed: sumUntransformed / TURNS,
    meanTransformed: sumTransformed / TURNS,
    meanRatio: ratioSum / TURNS,
    lastDropped, lastKept, totalMessages, overBudget, pairsSplit, pinnedLost,
  };
}

const ctx = runContextBloat(SEED);
console.log(`\nContext-bloat control (separate model — does NOT touch the routing arms above)`);
console.log('-'.repeat(76));
console.log(`  ${ctx.turns} turns, ${ctx.budget}-token budget, pinned system prompt, tool pairs every 3rd turn`);
console.log(row('peak context (tokens)', ctx.peakUntransformed, ctx.peakTransformed, (x) => String(Math.round(x)), true));
console.log(row('mean context (tokens)', ctx.meanUntransformed, ctx.meanTransformed, (x) => String(Math.round(x)), true));
console.log(`  mean compression ratio (retained/original): ${ctx.meanRatio.toFixed(3)}`);
// Deliberately NOT a cumulative drop count. Each turn re-transforms the whole
// conversation, so summing per-turn drops counts the same message hundreds of
// times: it read 173800 for a run containing 1200 messages. A number that large
// looks impressive and means nothing — the same wrong-metric shape this file
// already carries two warnings about.
console.log(`  final turn: ${ctx.lastKept} of ${ctx.totalMessages} messages retained (${ctx.lastDropped} dropped)`);
console.log(`  INTEGRITY — pairs split: ${ctx.pairsSplit}  pinned lost: ${ctx.pinnedLost}  turns over budget: ${ctx.overBudget}`);
console.log(`  (pairs split and pinned lost must both be 0; a non-zero value is a defect, not a tradeoff)`);

console.log(`\nWhat the harness LEARNED (earned reputation, 0-10000)`);
console.log('-'.repeat(76));
const ranked = EXPERTS.map((e) => ({
  id: e.id,
  trueQuality: e.trueQuality,
  earned: ledger.earnedScore(e.id),
  observed: ledger.view(e.id).observedScore,
  confidence: ledger.view(e.id).confidence,
  observations: ledger.observations(e.id),
  breaker: breakers.view(e.id).state,
  health: capacity.health(e.id),
})).sort((a, b2) => b2.earned - a.earned);

for (const r of ranked) {
  console.log(
    `  ${r.id.padEnd(9)} earned=${String(r.earned).padStart(5)}  observed=${String(r.observed).padStart(5)}  ` +
      `conf=${r.confidence.toFixed(2)}  true=${r.trueQuality.toFixed(2)}  eff=${effectiveQuality(EXPERTS.find((e) => e.id === r.id)).toFixed(2)}  obs=${String(r.observations).padStart(4)}  ` +
      `breaker=${r.breaker.padEnd(9)} health=${r.health}`
  );
}

// Rank correlation between what the harness learned and ground truth. This is
// the single number that says whether the reputation layer works at all.
const byEarned = [...ranked].sort((a, b2) => b2.earned - a.earned).map((r) => r.id);
const effByld = new Map(EXPERTS.map((e) => [e.id, effectiveQuality(e)]));
const byTruth = [...ranked]
  .sort((a, b2) => effByld.get(b2.id) - effByld.get(a.id))
  .map((r) => r.id);
let concordant = 0;
let comparisons = 0;
for (let i = 0; i < byTruth.length; i += 1) {
  for (let j = i + 1; j < byTruth.length; j += 1) {
    comparisons += 1;
    if (byEarned.indexOf(byTruth[i]) < byEarned.indexOf(byTruth[j])) concordant += 1;
  }
}
const tau = comparisons === 0 ? 0 : (2 * concordant) / comparisons - 1;

console.log(`\n  Kendall tau (learned rank vs EFFECTIVE quality): ${tau.toFixed(3)}   [1.0 = perfect, 0 = random]`);
console.log(`  (effective quality accounts for degradation/failure partway through the run;`);
console.log(`   ranking against nominal quality penalises the harness for correctly detecting decay)`);
console.log(`  Boaster: claimed 10000, earned ${ledger.earnedScore('boaster')}, true quality 0.35`);
console.log(`  Rookie:  claimed 0, earned ${ledger.earnedScore('rookie')}, true quality 0.95\n`);

// ── WHERE THE REMAINING LOSS LIVES — the ceiling nobody had measured ─────────
//
// Two consecutive sprints of routing/capacity work measured exactly zero. That
// is not a coincidence and it is not a broken measurement: it is what happens
// when you optimise a component that is already near its ceiling and never
// checked where the ceiling was.
//
// The single-expert ceiling is not a matter of opinion. No top-1 router, however
// perfect, can beat the best expert available to it. This section computes that
// bound three ways — analytically, with an omniscient router, and against what
// the harness actually achieves — so the remaining loss can be attributed
// instead of guessed at.

console.log(`\n\nWHERE THE REMAINING LOSS LIVES`);
console.log('='.repeat(76));

// (1) Analytic bound: the best instantaneous delivered quality, averaged over
//     the run. This is the best a top-1 router with PERFECT knowledge could do.
let analyticCeiling = 0;
for (let i = 0; i < TASKS; i += 1) {
  const p = i / TASKS;
  analyticCeiling += instantQuality(bestExpertAt(p), p);
}
analyticCeiling /= TASKS;

// (2) Omniscient arm: actually route to that expert and see what the world
//     returns. One call per task, no retries, no harness. Confirms the analytic
//     figure is not an algebra error.
function runOracle(seed) {
  const world = makeWorld(seed);
  let correct = 0;
  for (let i = 0; i < TASKS; i += 1) {
    const p = i / TASKS;
    const r = world.call(bestExpertAt(p), p, HARDNESS ? HARDNESS[i] : 0.5);
    if (r.correct) correct += 1;
  }
  return correct / TASKS;
}
const oracle = runOracle(SEED);

const achieved = harness.correct / TASKS;
const routingLoss = oracle - achieved;
const irreducible = 1 - analyticCeiling;

const pctC = (x) => `${(x * 100).toFixed(2)}%`;
console.log(`\n  best single expert, perfect knowledge (analytic)   ${pctC(analyticCeiling).padStart(8)}`);
console.log(`  omniscient top-1 router, measured                  ${pctC(oracle).padStart(8)}`);
console.log(`  the harness                                        ${pctC(achieved).padStart(8)}`);
console.log(`  naive baseline                                     ${pctC(baseline.correct / TASKS).padStart(8)}`);
console.log(`  ${'-'.repeat(52)}`);
console.log(`  loss the harness could still recover by ROUTING    ${pctC(routingLoss).padStart(8)}`);
console.log(`  loss NO top-1 router can recover, ever             ${pctC(irreducible).padStart(8)}`);
console.log(
  `\n  first-attempt picks that were the instantaneous best: ` +
    `${harness.pickedBest}/${harness.firstPicks} (${pctC(harness.pickedBest / harness.firstPicks)})`
);
console.log(
  `\n  The harness is at ${pctC(achieved / oracle)} of the omniscient top-1 bound. Routing is`
);
console.log(
  `  ESSENTIALLY SOLVED on this workload: the entire remaining prize for any`
);
console.log(
  `  router, scheduler, capacity or timeout change is ${pctC(routingLoss)} — which is why the`
);
console.log(`  last two sprints measured zero, and would have whatever they built.`);
console.log(
  `\n  The other ${pctC(irreducible)} is the best available expert simply being wrong. It is`
);
console.log(
  `  unreachable by CHOOSING better, because there is nothing better to choose.`
);
console.log(
  `  Only COMBINING experts can cross that line — several independent draws can`
);
console.log(
  `  be right where any single one is wrong. aggregate.ts measured +6.5pp doing`
);
console.log(`  exactly that, and it is NOT wired into the arm above.`);

// ── CROSSING THE CEILING — escalation-gated plurality aggregation ────────────
//
// The section above establishes that top-1 routing is done: ~2pp left against
// an omniscient bound, which is why two consecutive sprints of routing and
// capacity work measured exactly zero. The remaining ~6pp is the best available
// expert being wrong, and no router can choose its way out of that.
//
// This arm is the same harness with one thing added: when the escalation policy
// says the leader's margin is thin, call a panel of 3 and take the earned-weight
// plurality instead of the top-1 answer. Everything else is identical.

const panelRate = panelArm.escalated / TASKS;
const panelCalls = [...panelArm.perExpert.values()].reduce((a, b) => a + b, 0) / TASKS;
const panelCorrect = panelArm.correct / TASKS;

console.log(`\n\nCROSSING THE CEILING — panel of ${PANEL_CFG.panelSize}, escalated on margin < ${PANEL_CFG.escalateCfg.marginFloor}`);
console.log('='.repeat(76));
console.log(
  `  wrong-answer model: ${SCATTER_WRONG ? 'SCATTER (realistic)' : 'BLOC (pessimistic — wrong answers all agree)'}`
);
console.log(`\n  ${'arm'.padEnd(34)} ${'correct'.padStart(8)} ${'calls/task'.padStart(11)} ${'p99'.padStart(6)}`);
console.log(`  ${'-'.repeat(34)} ${'-'.repeat(8)} ${'-'.repeat(11)} ${'-'.repeat(6)}`);
console.log(
  `  ${'omniscient top-1 CEILING'.padEnd(34)} ${pctC(oracle).padStart(8)} ${'1.00'.padStart(11)} ${'-'.padStart(6)}`
);
console.log(
  `  ${'harness, top-1'.padEnd(34)} ${pctC(achieved).padStart(8)} ${h.callsPerTask.toFixed(2).padStart(11)} ${String(h.p99LatencyMs).padStart(6)}`
);
console.log(
  `  ${'harness + escalated panel'.padEnd(34)} ${pctC(panelCorrect).padStart(8)} ${panelCalls.toFixed(2).padStart(11)} ${String(percentile(panelArm.latencies, 99)).padStart(6)}`
);
const overCeiling = panelCorrect - oracle;
const overTop1 = panelCorrect - achieved;
console.log(`  ${'-'.repeat(62)}`);
console.log(
  `  vs top-1:   ${(overTop1 >= 0 ? '+' : '') + (overTop1 * 100).toFixed(2)}pp` +
    `   at ${(panelCalls - h.callsPerTask).toFixed(2)} extra calls/task` +
    `   = ${((overTop1 * 100) / Math.max(0.01, panelCalls - h.callsPerTask)).toFixed(2)}pp per extra call`
);
console.log(
  `  vs the omniscient top-1 ceiling: ${(overCeiling >= 0 ? '+' : '') + (overCeiling * 100).toFixed(2)}pp` +
    ` ${overCeiling > 0 ? '— CROSSED. No top-1 router could reach here.' : '— NOT crossed.'}`
);
console.log(
  `  escalated on ${(panelRate * 100).toFixed(0)}% of tasks; ${panelArm.screenedOut} screened out as clear picks.`
);
console.log(
  `\n  COST, stated plainly: p99 ${h.p99LatencyMs}ms -> ${percentile(panelArm.latencies, 99)}ms, calls/task` +
    ` ${h.callsPerTask.toFixed(2)} -> ${panelCalls.toFixed(2)}.`
);
console.log(
  `  A panel pays its slowest member, not the sum, so the latency cost is far`
);
console.log(`  below the call cost. Neither is netted out of the headline.`);

// Attribution. The panel arm gathers ~3x the observations per escalated task,
// so its ledger is better informed and would route better even if the extra
// answers were thrown away. This ablation throws them away.
const evidenceCorrect = evidenceArm.correct / TASKS;
console.log(`\n  ATTRIBUTION — where the +${((panelCorrect - achieved) * 100).toFixed(2)}pp actually comes from:`);
console.log(
  `  ${'top-1, one call'.padEnd(46)} ${pctC(achieved).padStart(8)}`
);
console.log(
  `  ${'panel called, LEADER answer taken (evidence only)'.padEnd(46)} ${pctC(evidenceCorrect).padStart(8)}` +
    `  ${((evidenceCorrect - achieved) * 100 >= 0 ? '+' : '') + ((evidenceCorrect - achieved) * 100).toFixed(2)}pp`
);
console.log(
  `  ${'panel called, PLURALITY answer taken'.padEnd(46)} ${pctC(panelCorrect).padStart(8)}` +
    `  ${((panelCorrect - achieved) * 100 >= 0 ? '+' : '') + ((panelCorrect - achieved) * 100).toFixed(2)}pp`
);
console.log(
  `  => extra evidence contributes ${((evidenceCorrect - achieved) * 100).toFixed(2)}pp;` +
    ` aggregation itself contributes ${((panelCorrect - evidenceCorrect) * 100).toFixed(2)}pp.`
);

// ── WHERE THE PANEL STOPS PAYING ─────────────────────────────────────────────
//
// The number above is only as good as one modelling assumption: that each
// expert's correctness is an INDEPENDENT draw. A panel of 3 is worth paying for
// because it buys three independent chances. Real experts fail on the SAME hard
// tasks, and to the extent they do, the extra calls buy nothing.
//
// `--hardness W` makes difficulty a per-task property every expert shares,
// symmetric around the mean so average quality is unchanged and only the
// task-to-task variance rises. Measured across 3 seeds, panel vs top-1:
//
//   W=0.0   +4.70pp     the published world — errors fully independent
//   W=0.2   +4.90pp
//   W=0.4   +3.75pp
//   W=0.6   +2.55 / +0.85 / +3.80 pp
//   W=0.8   +0.65 / +0.05 / -0.05 pp   <- the gain is gone
//   W=1.0   -0.85 / +0.05 / -0.70 pp   <- and it inverts
//
// **The panel stops paying at W ~= 0.8 and becomes a net loss at 1.0, while
// still costing 2.77x the calls.** Against the omniscient ceiling the crossover
// is earlier still, around W ~= 0.7.
//
// So the Sprint L result is not unconditional and must not be quoted as if it
// were. It holds while expert errors are substantially independent. The
// deployment question this implies is measurable on real traffic before
// enabling anything: how often do two experts get the SAME task wrong?
console.log(
  `\n  BOUNDARY: this gain assumes expert errors are independent. Re-run with` +
    ` --hardness W`
);
console.log(
  `  to correlate them through shared task difficulty. The advantage decays to` +
    ` zero at`
);
console.log(
  `  W~0.8 and inverts at 1.0, at unchanged cost. See the note above this line.`
);

// ── CAN THE HARNESS DETECT ITS OWN BOUNDARY? ─────────────────────────────────
//
// The boundary above is only actionable if a live fleet can tell which side of
// it it is on. `agreement.ts` estimates that from panel observations alone. The
// simulator is the one place the estimator can be VALIDATED rather than merely
// run, because here the true correlation is a knob (`--hardness W`) and the
// estimate can be checked against it.
{
  const ag = panelAgreement.stats();
  console.log(`\n  CO-FAILURE ESTIMATOR (true hardness W = ${HARDNESS_W})`);
  console.log(
    `  fleet lift ${ag.fleetLift === null ? 'n/a' : ag.fleetLift.toFixed(2)}` +
      `  (1.0 = independent, higher = experts fail on the SAME tasks)` +
      `  evidence ${ag.evidence}, confident ${ag.confident}`
  );
  const best = panelAgreement.mostIndependentPair();
  if (best) {
    console.log(
      `  least correlated pair: ${best.a}/${best.b} lift ${best.lift.toFixed(2)}` +
        ` over ${best.coObservations} shared tasks — the panel worth running.`
    );
  }
}

// The direct measurement, which needed no assumption about correlation at all.
{
  const u = panelAgreement.panelUplift();
  console.log(
    `\n  PANEL UPLIFT, measured directly on the ${u.observations} tasks a panel ran:`
  );
  console.log(
    `  leader alone right ${u.leaderCorrect}, panel right ${u.panelCorrect}` +
      `  =>  ${u.upliftPp === null ? 'n/a' : (u.upliftPp >= 0 ? '+' : '') + u.upliftPp.toFixed(2) + 'pp'}` +
      ` on escalated tasks`
  );
  console.log(
    `  rescued ${u.rescued} (leader wrong, panel right), spoiled ${u.spoiled} (leader right, panel wrong).`
  );
  console.log(
    `  Reported apart on purpose: rescue 200 / spoil 190 nets +10 and is a coin`
  );
  console.log(`  flip dressed as a mechanism; rescue 60 / spoil 0 nets less and is better.`);
}

// ── THE ADAPTIVE GATE — does measuring beat committing? ──────────────────────
//
// Two fixed policies each win half the range and lose the other half: always-
// panel gains +4.70pp at W=0 and loses 0.85pp at W=1.0; never-panel does the
// reverse. Neither can be the right default, because the right answer is a
// property of the fleet and is not knowable in advance.
//
// This arm decides by measuring. It panels until it has evidence, then keeps
// panelling only while the measured uplift clears a floor — and keeps a 5%
// trickle running forever so the verdict can be revisited. The test is not
// "does it beat top-1"; it is whether it tracks the BETTER of the two fixed
// policies at both ends without being told which end it is at.
{
  const adaptiveCorrect = adaptiveArm.correct / TASKS;
  const adaptiveCalls = [...adaptiveArm.perExpert.values()].reduce((a, b) => a + b, 0) / TASKS;
  const ps = adaptivePolicy.stats();
  const au = adaptiveAgreement.panelUplift();
  console.log(`\n  ADAPTIVE GATE (warmup 150 panels, floor +0.5pp, 5% exploration)`);
  console.log(
    `  ${'arm'.padEnd(26)} ${'correct'.padStart(8)} ${'calls/task'.padStart(11)}`
  );
  console.log(`  ${'-'.repeat(26)} ${'-'.repeat(8)} ${'-'.repeat(11)}`);
  console.log(
    `  ${'top-1 (never panel)'.padEnd(26)} ${pctC(achieved).padStart(8)} ${h.callsPerTask.toFixed(2).padStart(11)}`
  );
  console.log(
    `  ${'always panel'.padEnd(26)} ${pctC(panelCorrect).padStart(8)} ${panelCalls.toFixed(2).padStart(11)}`
  );
  console.log(
    `  ${'adaptive'.padEnd(26)} ${pctC(adaptiveCorrect).padStart(8)} ${adaptiveCalls.toFixed(2).padStart(11)}`
  );
  const best = Math.max(achieved, panelCorrect);
  console.log(
    `  vs the BETTER of the two fixed policies: ` +
      `${((adaptiveCorrect - best) * 100).toFixed(2)}pp` +
      `  (>=0 means it matched or beat the better one without being told which)`
  );
  console.log(
    `  panelled ${adaptiveArm.escalated} tasks; ${ps.explorations} of those were pure exploration ` +
      `(${(ps.explorationRate * 100).toFixed(1)}%).`
  );
  console.log(
    `  its own verdict: uplift ${au.upliftPp === null ? 'n/a' : au.upliftPp.toFixed(2) + 'pp'}` +
      `, rescued ${au.rescued}, spoiled ${au.spoiled}.`
  );
}

// ── THE PANEL'S OWN CEILING ──────────────────────────────────────────────────
//
// Sprint L's lesson, applied one level up before repeating its mistake. Having
// found that top-1 routing was at 97.9% of its bound and that further routing
// work therefore could not pay, the obvious next move is to tune the panel —
// size, thresholds, membership. That is exactly the move Sprint L showed to be
// unwise WITHOUT first knowing the bound.
//
// So: what would an omniscient PANEL score? Same aggregation, same pessimistic
// wrong-answer model, but membership chosen by true instantaneous quality
// rather than by earned reputation. That is the best any panel of this size can
// do, and the gap to it is the entire remaining prize for panel tuning.
function runOraclePanel(seed, size) {
  const world = makeWorld(seed);
  const clock = new ManualClock(0);
  const agg = new PluralityAggregator(clock, { minProposals: 2 });
  let correct = 0;
  for (let i = 0; i < TASKS; i += 1) {
    const p = i / TASKS;
    const hardness = HARDNESS ? HARDNESS[i] : 0.5;
    const members = [...EXPERTS]
      .sort((a, b) => instantQuality(b, p) - instantQuality(a, p))
      .slice(0, size);
    const proposals = [];
    for (const e of members) {
      const r = world.call(e, p, hardness);
      if (r.hang || !r.ok) continue;
      const key = r.correct ? 'right' : SCATTER_WRONG ? `wrong:${e.id}` : 'wrong';
      // Omniscient membership, but NOT omniscient weighting — weights stay
      // uniform, because a ledger that already knew the truth would make the
      // whole harness unnecessary and the bound meaningless.
      proposals.push({ expert: e.id, key, answer: key, earnedScore: 5000 });
    }
    if (proposals.length === 0) continue;
    const a = agg.aggregate(proposals);
    if (a.outcome === 'DECIDED' && a.key === 'right') correct += 1;
  }
  return correct / TASKS;
}

console.log(`\n  PANEL CEILING — how much is left for panel tuning?`);
console.log(`  ${'arm'.padEnd(34)} ${'correct'.padStart(8)}`);
console.log(`  ${'-'.repeat(34)} ${'-'.repeat(8)}`);
console.log(`  ${'omniscient TOP-1 ceiling'.padEnd(34)} ${pctC(oracle).padStart(8)}`);
for (const k of [3, 4, 5]) {
  console.log(
    `  ${`omniscient PANEL of ${k} ceiling`.padEnd(34)} ${pctC(runOraclePanel(SEED, k)).padStart(8)}`
  );
}
console.log(`  ${'the harness panel of 3 (earned)'.padEnd(34)} ${pctC(panelCorrect).padStart(8)}`);
{
  const c3 = runOraclePanel(SEED, 3);
  console.log(
    `\n  The panel arm is at ${pctC(panelCorrect / c3)} of the omniscient panel-of-3 bound.`
  );
  console.log(
    `  Remaining prize for choosing panel MEMBERS better: ${((c3 - panelCorrect) * 100).toFixed(2)}pp.`
  );
}
