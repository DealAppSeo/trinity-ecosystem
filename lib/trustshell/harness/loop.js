// lib/trustshell/harness/loop.ts — the agent execution kernel.
//
// WHAT THIS IS FOR. `HarnessProfile` defines 47 settings across six dimensions,
// with authority tagging, bounds clamping and 31 assertions, and — measured
// 2026-08-14 — exactly ZERO production consumers. The same is true of the
// reliability modules beside this file, of MemoryRecall, of memory-authz, and
// of the identity layer. This is the missing consumer. The loop body is the
// small part; the enforcement points are the reason it exists.
//
// See docs/AGENT-LOOP-SCOPE.md for the measurement and the staging.
//
// ── THE ONE PROPERTY WORTH THE WHOLE FILE ────────────────────────────────────
//
// **An agent cannot self-certify above what the harness observed.**
//
// The recurring defect in this codebase is a system reporting success it has
// not earned: a skipped test scored as a pass, a build green over undefined
// references, a credential check green with no credential, a vault gate resting
// on a boolean nobody wrote evidence for. An agent loop is where that defect
// would find its widest surface, because the agent narrates its own outcome.
//
// So the model's claimed outcome is a CEILING REQUEST, not a verdict. The loop
// tracks what it actually observed and takes the weaker of the two. An agent
// that says VERIFIED after a blocked host, a denied call, or a harness error
// gets NOT_CHECKED, and no prompt can talk it out of that — the downgrade is
// arithmetic over recorded events, not a judgement the model participates in.
//
// ── PORTABILITY: WHY AUTHORIZATION ARRIVES THROUGH A PORT ────────────────────
//
// This directory may not import anything outside itself, and that is enforced
// (scripts/harness-portability-check.mjs). The capability algebra, ControlProof
// verification and caveat evaluation all live in lib/trustshell/identity/, so
// they cannot be imported here and must not be reimplemented here — a second
// copy of an authorization rule is a second thing to get wrong, and the two
// copies disagree silently.
//
// `Authorizer` is therefore a PORT. The identity-backed adapter lives outside
// this directory. The kernel stays shippable as a package, and the same kernel
// runs under a different trust system by supplying a different adapter.
//
// ── TWO GATES, DELIBERATELY REDUNDANT ────────────────────────────────────────
//
// Every tool call passes BOTH a policy gate (this file: allowlist, write
// budget, irreversible list) and the injected `Authorizer` (capability
// attenuation, caveats, the ControlProof). Neither is sufficient. Delegating
// everything to the port would mean a missing adapter is a fail-OPEN, and the
// port is the part a downstream integrator replaces. Duplicating the identity
// algebra here would be the silent-disagreement bug above.
//
// The redundancy has a known consequence, learned the expensive way in LESSONS
// A12: two checks that each make the other redundant are invisible to
// single-mutation testing, and "each one is individually redundant" is exactly
// the argument that deletes both. The suite mutates them as a PAIR.
/**
 * Ordering used to take the weaker of two outcomes.
 *
 * NOT a quality ranking — FAILED is not "worse" than NOT_CHECKED in any
 * business sense. It is a CLAIM-STRENGTH ranking: VERIFIED asserts the most and
 * therefore needs the most evidence, so it is the one a ceiling can revoke.
 */
const CLAIM_STRENGTH = {
    FAILED: 0,
    NOT_CHECKED: 1,
    VERIFIED: 2,
};
/** The weaker claim of the two. */
export function weakerOutcome(a, b) {
    return CLAIM_STRENGTH[a] <= CLAIM_STRENGTH[b] ? a : b;
}
/**
 * Whether a call spends write budget.
 *
 * `unknown` COUNTS. `rm -rf` and `git status` arrive through the same tool, so
 * treating unknown as a read would let the most dangerous calls through the
 * cheapest door. The consequence is deliberate and worth stating: with the
 * default `tools.max_writes_per_session` of 0, an agent may call only tools
 * explicitly classified `read`. Widening that is an operator act — classify the
 * tools, or earn the budget — not something the kernel assumes.
 */
function spendsWriteBudget(effect) {
    return effect !== 'read';
}
// ---------------------------------------------------------------------------
// Canonical fingerprinting, for progress detection
// ---------------------------------------------------------------------------
/**
 * Stable JSON. Key order is insertion order in a normal stringify, so two
 * identical argument objects built in different orders would fingerprint
 * differently and every repeated call would look like progress.
 */
function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    const obj = value;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}
function callFingerprint(call) {
    return `${call.name}${canonical(call.args)}`;
}
export async function runAgentLoop(input) {
    const { taskId, model, tools, authorizer, clock } = input;
    // Copied and frozen at entry, and every collection snapshotted. This is what
    // makes "untrusted tool output cannot widen authority" a structural property
    // rather than a rule someone has to remember: there is no live path from a
    // caller's object into a decision this loop makes after it starts.
    //
    // WHICH PART DOES THE WORK — checked by mutation rather than assumed, because
    // the first version of this comment credited the wrong mechanism. The Sets
    // protect the two lists (built once, immune to a later push). The COPY is
    // what protects the scalars: `maxWritesPerSession` is read on every call, so
    // a live reference would let a caller raise the budget mid-run. Replacing the
    // copy with a reference survived the allowlist test for exactly that reason —
    // the snapshot was doing the work the freeze was being credited for.
    //
    // The freeze is shallow, so the honest scope of the guarantee is: the KERNEL
    // never widens its own policy, and no post-entry mutation of the caller's
    // object reaches these decisions.
    const policy = Object.freeze({ ...input.policy });
    const allowed = new Set(policy.toolsAllowed);
    const irreversible = new Set(policy.irreversibleRequiresHuman);
    const untrustedSources = new Set(policy.untrustedOutputSources);
    const turns = [];
    const callsByTool = {};
    let writes = 0;
    let deniedAttempts = 0;
    // The ceiling. Starts at the strongest claim and only ever weakens.
    let ceiling = 'VERIFIED';
    let ceilingReason = '';
    const lowerCeiling = (to, why) => {
        const next = weakerOutcome(ceiling, to);
        if (next !== ceiling) {
            ceiling = next;
            ceilingReason = why;
        }
    };
    /** Last result seen for each (tool, args). The basis of progress detection. */
    const lastResultFor = new Map();
    let observations = [];
    let consecutiveNoProgress = 0;
    let stopReason = 'iteration_budget_exhausted';
    let handoff;
    let totalCalls = 0;
    const counters = () => ({
        turn: turns.length,
        totalCalls,
        callsByTool: { ...callsByTool },
        writes,
        deniedAttempts,
    });
    for (let turn = 1; turn <= policy.maxIterations; turn += 1) {
        const startedAt = clock.now();
        let proposed;
        try {
            proposed = await model.turn({
                taskId,
                turn,
                observations,
                iterationsRemaining: policy.maxIterations - turn,
            });
        }
        catch (e) {
            // The MODEL failed, not the agent's task. `reliability.harness_error_marks_not_checked`:
            // a harness fault is not evidence about the work.
            lowerCeiling('NOT_CHECKED', `the model client threw on turn ${turn}: ${e.message}`);
            stopReason = 'model_error';
            turns.push({
                turn,
                startedAt,
                calls: [],
                madeProgress: false,
                progressReason: 'the model client threw',
            });
            break;
        }
        const records = [];
        observations = [];
        for (const call of proposed.calls) {
            const effect = policy.toolEffects[call.name] ?? 'unknown';
            // Snapshot BEFORE incrementing. `SessionCounters` means "before this
            // call" — see the type. Incrementing first would hand the authorizer a
            // count that includes the call it is being asked to rule on, and a
            // `maxCalls: 2` caveat would then permit only one.
            const session = counters();
            callsByTool[call.name] = (callsByTool[call.name] ?? 0) + 1;
            totalCalls += 1;
            const verdict = await decide({
                call,
                effect,
                allowed,
                irreversible,
                maxWrites: policy.maxWritesPerSession,
                writesSoFar: writes,
                authorizer,
                session,
            });
            if (!verdict.allowed) {
                deniedAttempts += 1;
                // A denial is NOT the end of the loop. The agent sees it and may adapt,
                // which is the behaviour worth having — an agent that tries a forbidden
                // tool and then routes around it is working correctly.
                //
                // It DOES lower the ceiling: a run in which something was refused has
                // not verified whatever that call was for.
                lowerCeiling('NOT_CHECKED', verdict.kind === 'authorizer_error'
                    ? `the authorizer could not answer and the call failed closed: ${verdict.reason}`
                    : `a tool call was refused (${verdict.kind}): ${verdict.reason}`);
                const denial = {
                    callId: call.id,
                    tool: call.name,
                    outcome: 'denied',
                    content: verdict.reason,
                    untrusted: false,
                };
                observations.push(denial);
                records.push({ call, effect, verdict, observation: denial });
                continue;
            }
            if (spendsWriteBudget(effect))
                writes += 1;
            let result;
            try {
                result = await tools.call(call);
            }
            catch (e) {
                result = { content: `tool threw: ${e.message}`, error: true };
            }
            const outcome = result.unavailable
                ? 'unavailable'
                : result.error
                    ? 'error'
                    : 'ok';
            if (outcome === 'unavailable') {
                lowerCeiling('NOT_CHECKED', `${call.name} was unreachable, so what it would have shown is unknown`);
            }
            const observation = {
                callId: call.id,
                tool: call.name,
                outcome,
                content: result.content,
                untrusted: untrustedSources.has(call.name),
            };
            observations.push(observation);
            records.push({ call, effect, verdict, observation });
        }
        const { madeProgress, progressReason } = assessProgress({
            proposed,
            records,
            lastResultFor,
        });
        turns.push({
            turn,
            startedAt,
            note: proposed.note,
            calls: records,
            handoff: proposed.handoff,
            madeProgress,
            progressReason,
        });
        if (proposed.handoff) {
            handoff = proposed.handoff;
            stopReason = 'typed_handoff';
            break;
        }
        consecutiveNoProgress = madeProgress ? 0 : consecutiveNoProgress + 1;
        if (consecutiveNoProgress >= policy.noProgressAbortAfter) {
            stopReason = 'no_progress';
            break;
        }
    }
    // ── The verdict ──────────────────────────────────────────────────────────
    //
    // Every path that is not a typed handoff is NOT_CHECKED, never FAILED.
    // Running out of iterations means the work was not finished; it does not mean
    // the work failed. Collapsing the two is exactly the two-outcome bug this
    // codebase keeps paying for.
    if (stopReason === 'iteration_budget_exhausted') {
        lowerCeiling('NOT_CHECKED', `the iteration budget of ${policy.maxIterations} was exhausted without a typed handoff`);
    }
    if (stopReason === 'no_progress') {
        lowerCeiling('NOT_CHECKED', `${policy.noProgressAbortAfter} consecutive turns changed nothing observable`);
    }
    const claimed = handoff?.outcome;
    const outcome = claimed === undefined ? ceiling : weakerOutcome(claimed, ceiling);
    const downgraded = claimed !== undefined && outcome !== claimed;
    return {
        taskId,
        outcome,
        stopReason,
        claimed,
        downgradedBecause: downgraded ? ceilingReason : undefined,
        turns,
        session: counters(),
        endedAt: clock.now(),
        detail: describe(stopReason, claimed, outcome, ceilingReason),
    };
}
// ---------------------------------------------------------------------------
// The two gates
// ---------------------------------------------------------------------------
async function decide(args) {
    const { call, effect } = args;
    // GATE 1 — policy over the loop's own state.
    //
    // An empty allowlist means NO tools. Not "unset, so allow everything": a
    // default that widens on absence is how an unconfigured deployment becomes
    // the most permissive one.
    if (!args.allowed.has(call.name)) {
        return {
            allowed: false,
            kind: 'not_in_allowlist',
            reason: `${call.name} is not in tools.allowed`,
        };
    }
    // Constitutional, and checked before anything that could be earned. No
    // reputation, capability or caveat buys a release tag or a merged PR back.
    if (args.irreversible.has(call.name)) {
        return {
            allowed: false,
            kind: 'irreversible_requires_human',
            reason: `${call.name} is irreversible and requires a human. This is constitutional — ` +
                'no score, capability or grant unlocks it.',
        };
    }
    if (spendsWriteBudget(effect) && args.writesSoFar >= args.maxWrites) {
        return {
            allowed: false,
            kind: 'write_budget_exhausted',
            reason: `tools.max_writes_per_session is ${args.maxWrites} and ${args.writesSoFar} ` +
                `have been spent. ${call.name} has effect '${effect}', which counts` +
                (effect === 'unknown' ? " — unknown counts, because rm -rf and git status share a tool." : '.'),
        };
    }
    // GATE 2 — the identity layer, through the port. Capability attenuation,
    // caveats and the ControlProof live there and are not reimplemented here.
    try {
        return await args.authorizer.authorize({ call, effect, session: args.session });
    }
    catch (e) {
        // FAIL CLOSED. An authorizer that cannot answer has not said yes.
        return {
            allowed: false,
            kind: 'authorizer_error',
            reason: `the authorizer threw and the call was refused: ${e.message}`,
        };
    }
}
// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
/**
 * Did this turn change anything observable?
 *
 * THE DEFINITION, stated because it is the one enforcement point in this file
 * that the spec does not pin down (docs/AGENT-LOOP-SCOPE.md flags it as the open
 * decision):
 *
 *   A turn makes progress if it produced at least one tool result DIFFERING
 *   from the previous result for the same (tool, arguments).
 *
 * It needs no semantics, costs one hash per call, and catches the observed
 * failure mode — an agent retrying an identical call and getting an identical
 * answer. It MISFIRES on legitimately idempotent polling, where the honest
 * answer is genuinely the same twice; that is a known cost, stated rather than
 * discovered, and the reason `loops.no_progress_abort_after` defaults to 3
 * rather than 1.
 *
 * A turn that proposes no tool calls and no handoff makes no progress by
 * definition. That is the classic stall: an agent that says it is finished and
 * does not stop. `loops.stop_requires_typed_handoff` means prose is not an
 * exit, so this counter is what ends it.
 */
function assessProgress(args) {
    const { proposed, records, lastResultFor } = args;
    if (proposed.handoff) {
        return { madeProgress: true, progressReason: 'the turn produced a typed handoff' };
    }
    if (records.length === 0) {
        return {
            madeProgress: false,
            progressReason: 'no tool calls and no handoff — prose is not an exit, so this is a stall, not a stop',
        };
    }
    let progressed = false;
    const reasons = [];
    for (const record of records) {
        if (!record.observation)
            continue;
        const key = callFingerprint(record.call);
        const fingerprint = `${record.observation.outcome}${record.observation.content}`;
        const previous = lastResultFor.get(key);
        lastResultFor.set(key, fingerprint);
        if (previous === undefined) {
            progressed = true;
            reasons.push(`${record.call.name} had not been called with these arguments before`);
        }
        else if (previous !== fingerprint) {
            progressed = true;
            reasons.push(`${record.call.name} returned a different result than last time`);
        }
    }
    if (progressed)
        return { madeProgress: true, progressReason: reasons.join('; ') };
    return {
        madeProgress: false,
        progressReason: 'every call repeated an earlier call and returned the identical result',
    };
}
// ---------------------------------------------------------------------------
function describe(stopReason, claimed, outcome, ceilingReason) {
    const head = stopReason === 'typed_handoff'
        ? `the agent stopped with a typed handoff claiming ${claimed}`
        : stopReason === 'no_progress'
            ? 'the agent was stopped after consecutive turns that changed nothing observable'
            : stopReason === 'model_error'
                ? 'the model client threw, so the run says nothing about the task'
                : 'the agent ran out of iterations without a typed handoff';
    if (claimed !== undefined && outcome !== claimed) {
        return `${head}, reduced to ${outcome} because ${ceilingReason}. An agent cannot certify above what the harness observed.`;
    }
    return `${head}; final outcome ${outcome}.`;
}
