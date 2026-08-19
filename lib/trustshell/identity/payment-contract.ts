// lib/trustshell/identity/payment-contract.ts
//
// The live /pay caller for the contracted spine.
//
// Claim (TRUST-HARNESS-STATUS): a payment must not approve unless the
// contracted path ran — runContractedWork + an independent Evaluator — or the
// route fails closed with an explicit reason. Silent skip is the gap.
//
// This module IS that call. The route may not set approved:true unless
// `mayApproveAfterContract` returns true. Seeds missing, evaluator outage,
// self-judge, and a FAILED verdict are all denials. BFT observe mode is
// unchanged: this gate is not ControlProof and not BFT enforce.

import { keyPairFromSeed, type Did } from './did';
import { runContractedWork } from './spine';
import type { JudgeTier } from './staged-judge';
import {
  ReviewConfigError,
  reviewConfigFrom,
  type ReviewConfig,
} from '../review/session';

export type PaymentBrief = {
  paymentId: string;
  agentName: string;
  amountUSDC: number;
  recipientAddress: string;
  purpose: string;
};

export type PaymentContractDecision =
  | {
      invoked: true;
      outcome: 'VERIFIED' | 'FAILED';
      doerDid: Did;
      checkerDid: Did;
      boundToPayment: boolean;
      contractId: string;
      withheld: readonly unknown[];
    }
  | {
      invoked: false;
      outcome: 'NOT_CHECKED';
      reason: string;
      code: 'SEEDS_MISSING' | 'SPINE_REFUSED' | 'NO_VERDICT' | 'EVALUATOR_OUTAGE';
    };

const SUBMISSION_TOOL = 'submission';

export function mayApproveAfterContract(d: PaymentContractDecision): boolean {
  return (
    d.invoked === true &&
    d.outcome === 'VERIFIED' &&
    d.boundToPayment === true &&
    d.checkerDid !== d.doerDid
  );
}

export function paymentBindingTiers(brief: PaymentBrief): readonly JudgeTier[] {
  return [
    {
      name: 'payment-binding',
      judge: {
        async judge(request) {
          const hay = `${request.evidence}\n${request.deliverable}`;
          const bound =
            hay.includes(brief.paymentId) && hay.includes(String(brief.agentName));
          return {
            outcome: bound ? 'VERIFIED' : 'FAILED',
            score: bound ? 1 : 0,
            detail: bound
              ? 'payment brief is bound to this contract'
              : 'payment brief is not bound to this contract',
          };
        },
      },
    },
  ];
}

function submissionExecution(deliverable: string, now: () => Date) {
  return {
    policy: {
      maxIterations: 2,
      noProgressAbortAfter: 2,
      toolsAllowed: [SUBMISSION_TOOL],
      irreversibleRequiresHuman: [] as string[],
      untrustedOutputSources: [SUBMISSION_TOOL],
      maxWritesPerSession: 0,
      toolEffects: { [SUBMISSION_TOOL]: 'read' as const },
    },
    model: {
      calls: 0,
      async turn() {
        this.calls += 1;
        if (this.calls === 1) {
          return { calls: [{ id: 's1', name: SUBMISSION_TOOL, args: {} }] };
        }
        return {
          calls: [],
          handoff: {
            outcome: 'VERIFIED' as const,
            summary: 'payment brief presented for contracted evaluation',
            evidence: [] as string[],
          },
        };
      },
    },
    tools: {
      async call(call: { name?: string }) {
        if (call?.name !== SUBMISSION_TOOL) {
          throw new Error(`payment contract dispatches only ${SUBMISSION_TOOL}`);
        }
        return { content: deliverable };
      },
    },
    authorizer: {
      async authorize(request: { call?: { name?: string } }) {
        if (request?.call?.name === SUBMISSION_TOOL) {
          return { allowed: true as const, reason: 'presenting the payment brief' };
        }
        return {
          allowed: false as const,
          kind: 'not_in_allowlist' as const,
          reason: 'payment contract authorizes nothing but presenting the brief',
        };
      },
    },
    clock: { now: () => now().getTime() },
  };
}

export async function evaluateContractedPayment(input: {
  brief: PaymentBrief;
  env: Record<string, string | undefined>;
  observedAt?: string;
  now?: () => Date;
}): Promise<PaymentContractDecision> {
  return evaluateContractedPaymentWith({
    ...input,
    tiers: paymentBindingTiers(input.brief),
  });
}

export async function evaluateContractedPaymentWith(input: {
  brief: PaymentBrief;
  env: Record<string, string | undefined>;
  tiers: readonly JudgeTier[];
  observedAt?: string;
  now?: () => Date;
  /** Test-only: force the candidate pool to the doer. Production never sets this. */
  selfJudge?: boolean;
}): Promise<PaymentContractDecision> {
  let config: ReviewConfig;
  try {
    config = reviewConfigFrom(input.env);
  } catch (err) {
    const message = err instanceof ReviewConfigError ? err.message : String(err);
    return {
      invoked: false,
      outcome: 'NOT_CHECKED',
      code: 'SEEDS_MISSING',
      reason: message,
    };
  }

  try {
    return await runPaymentSpine(config, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outage = /threw|outage|ECONN|ENOTFOUND|provider/i.test(message);
    return {
      invoked: false,
      outcome: 'NOT_CHECKED',
      code: outage ? 'EVALUATOR_OUTAGE' : 'SPINE_REFUSED',
      reason: message,
    };
  }
}

async function runPaymentSpine(
  config: ReviewConfig,
  input: {
    brief: PaymentBrief;
    tiers: readonly JudgeTier[];
    observedAt?: string;
    now?: () => Date;
    selfJudge?: boolean;
  }
): Promise<PaymentContractDecision> {
  const now = input.now ?? (() => new Date());
  const observedAt = input.observedAt ?? now().toISOString();
  const doer = await keyPairFromSeed(config.doerSeed);
  const auditors = await Promise.all(config.auditorSeeds.map((s) => keyPairFromSeed(s)));
  const keyFor = new Map(auditors.map((a) => [a.did, a.privateKey]));
  const candidates = input.selfJudge
    ? [{ did: doer.did, qualification: { tier: config.minTier, badges: [...config.requiredBadges] } }]
    : auditors.map((a) => ({
        did: a.did,
        qualification: { tier: config.minTier, badges: [...config.requiredBadges] },
      }));

  const deliverable = JSON.stringify(input.brief);
  const result = await runContractedWork({
    assignment: {
      taskId: input.brief.paymentId,
      doerDid: doer.did,
      deliverable,
      requirement: { minTier: config.minTier, requiredBadges: config.requiredBadges },
      nonce: `pay:${input.brief.paymentId}`,
      beacon: `pay:${input.brief.paymentId}`,
      candidates,
      bank: [
        { id: 'pay-bound', statement: 'The payment brief is bound to this contract.', minScore: 0.9 },
        { id: 'pay-amount', statement: 'The amount in the brief is the amount contracted.', minScore: 0.9 },
        { id: 'pay-agent', statement: 'The paying agent is the contracted doer.', minScore: 0.9 },
        { id: 'pay-purpose', statement: 'The stated purpose is present in the brief.', minScore: 0.9 },
      ],
      criteriaCount: 2,
      proposedAt: observedAt,
    },
    doerKey: doer.privateKey,
    checkerKeyFor: (did) => keyFor.get(did),
    tiers: input.tiers,
    execution: submissionExecution(deliverable, now),
    now,
    observedAt,
  });

  const verdict = result.verdict;
  if (!verdict) {
    return {
      invoked: false,
      outcome: 'NOT_CHECKED',
      code: 'NO_VERDICT',
      reason: 'contracted evaluation produced no signed verdict',
    };
  }

  const checkerDid = result.assigned.unsigned.checkerDid;
  const boundToPayment =
    result.verdictVerification?.boundToContract === true &&
    result.assigned.unsigned.taskId === input.brief.paymentId;

  const outcome: 'VERIFIED' | 'FAILED' =
    result.loop.outcome === 'VERIFIED' && verdict.outcome === 'VERIFIED' ? 'VERIFIED' : 'FAILED';

  return {
    invoked: true,
    outcome,
    doerDid: doer.did,
    checkerDid,
    boundToPayment,
    contractId: result.assigned.unsigned.taskId,
    withheld: result.reputation?.withheld ?? [],
  };
}
