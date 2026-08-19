// app/api/trustrails/pay/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import {
  KYAValidator, BFTAuthorizer, ComplianceReceiptGenerator,
  SolanaExecutor, FireblocksPreAuth,
  ZKPAttestationService, RepIDCalculator
} from '@/lib/trustshell';
import { bftEnforcementMode } from '@/lib/trustshell/BFTAuthorizer';
import { EarnedMetricsRepository } from '@/lib/trustshell/EarnedMetricsRepo';
import { toScoringInputs } from '@/lib/trustshell/EarnedMetrics';
import { TIER_LIMITS, tierForScore } from '@/lib/trustshell/repid-scoring';
import { rewardFor, rewardReason, isPermittedReward } from '@/lib/trustshell/reward';

export async function POST(req: NextRequest) {
  const { agentName, amountUSDC, recipientAddress, purpose, signatures } = await req.json();

  const kya        = new KYAValidator();
  const bft        = new BFTAuthorizer();
  const receipts   = new ComplianceReceiptGenerator();
  const solana     = new SolanaExecutor();
  const fireblocks = new FireblocksPreAuth();
  const zkp        = new ZKPAttestationService();
  const calc       = new RepIDCalculator();
  const earnedMetrics = new EarnedMetricsRepository();

  try {
    // Step 1: KYA Validation
    const kyaResult = await kya.validate(agentName, amountUSDC);
    if (!kyaResult.kya_verified) {
      return NextResponse.json({
        approved: false,
        stage: 'kya_validation',
        reason: kyaResult.denialReason,
        agentRepid: kyaResult.repidScore,
        tier: kyaResult.repidTier,
      }, { status: 403 });
    }

    // Addendum 2: Real-time Institutional RepID Calculation
    //
    // These four inputs were literals — bftAccuracy 94, veritasCatchRate 97,
    // x402SuccessRate 100, latencyMs 180 — on the live payment path. The
    // calculator's maths and weights were real and it did not matter: constant
    // inputs produce a constant score, so RepID could not move with behaviour.
    //
    // They are now measured from recorded outcomes, decayed and shrunk (see
    // lib/trustshell/EarnedMetrics.ts). Two of the four come back `unmeasured`
    // because the underlying data does not exist — no table records BFT results
    // or per-agent latency — and unmeasured scores zero rather than being
    // assumed. Real scores are therefore markedly lower than the fabricated ones
    // they replace. That is the correction, not a regression: the old number was
    // never earned. `evidence` in the response says exactly what was measured.
    const institution = req.nextUrl.searchParams.get('institution') || 'default';
    const earned = await earnedMetrics.load(agentName);
    const repidResult = await calc.calculate(
      agentName,
      {
        ...toScoringInputs(earned.metrics),
        humanCustody: kyaResult.humanCustodyBound,
      },
      institution
    );

    // THE THRESHOLD MUST BE KNOWN BEFORE THE GATE IS APPLIED.
    //
    // `threshold` is nullable because an unreadable institution config used to
    // become 5000 silently — which for an institution that had stored a
    // stricter number LOWERS the bar, a fail-open reached by an outage rather
    // than by any input. Denying here is the same trade the daily-limit check
    // makes: a limit that could not be evaluated is not a limit that passed.
    if (repidResult.threshold === null || repidResult.meetsThreshold === null) {
      return NextResponse.json({
        approved: false,
        stage: 'repid_threshold',
        message: `RepID payment threshold NOT_CHECKED: ${repidResult.thresholdDetail}`,
        repidScore: repidResult.repidScore,
        thresholdSource: repidResult.thresholdSource,
      }, { status: 503 });
    }

    // Addendum 2: KYA commitment. NOT a zero-knowledge proof — it never was.
    // The object used to carry proofSystem 'groth16' over a SHA-256 of a
    // timestamp; it now reports proven=false and binds the decision to a
    // reproducible commitment instead.
    const zkpAttestation = await zkp.generateKYAAttestation({
      agentName,
      repidScore: repidResult.repidScore,
      threshold: repidResult.threshold,
      humanCustodyBound: kyaResult.humanCustodyBound,
    });

    kyaResult.repidScore = repidResult.repidScore;
    // Carries the commitment, not a proof. The field name is inherited from the
    // receipt schema and the zkp_proof_cid column; the value now says what it is.
    kyaResult.zkpProofCID = zkpAttestation.commitment;

    // Addendum 3: Dual-Signature Gate (SBT Role Diversity)
    const SINGLE_SIG_THRESHOLD = 50000;
    if (amountUSDC > SINGLE_SIG_THRESHOLD) {
      if (!signatures || signatures.length < 2) {
        return NextResponse.json({
          approved: false,
          stage: 'dual_signature_gate',
          message: 'Accepted but pending dual SBT authorization. Amount exceeds single-signature threshold.',
          requiredSignatures: ['CFO', 'CTO'],
        }, { status: 202 });
      }
      
      const roles = new Set(signatures.map((s: any) => s.role));
      if (roles.size < 2) {
        return NextResponse.json({
          approved: false,
          stage: 'dual_signature_gate',
          message: 'Dual signatures must come from distinct institutional roles (e.g., CFO and CTO). CFO and CFO cannot dual-sign together.',
        }, { status: 403 });
      }
    }

    // Step 2: BFT Consensus Authorization
    const paymentId = crypto.randomUUID();
    const ruleHash  = await sha256(`${agentName}:${amountUSDC}:${recipientAddress}:${purpose}`);

    // A FOURTH tier ladder lived here: `repidScore > 7500 ? 100000 : 50000`.
    // Exclusive where TIER_FLOORS is inclusive, so an agent at exactly 7500 was
    // Platinum by the ladder and Gold by this line — and every Silver and
    // Bronze agent was handed Gold's per-transaction figure, 50000 against a
    // real Bronze limit of 100. The panel weighs this number, so a wrong one is
    // a wrong brief. Same defect as the two disagreeing ladders, third
    // recurrence; same fix, which is to delete the second implementation.
    const maxWithdrawal = TIER_LIMITS[tierForScore(kyaResult.repidScore)].perTx;

    // The panel needs the actual decision context, not just an amount — the
    // recipient, the stated purpose and the agent's standing are what a
    // reviewer weighs. In observe mode this returns immediately without
    // consulting anything; in enforce mode it runs the three providers inline.
    const authorizationContext = {
      paymentId,
      agentName,
      amountUSDC,
      maxWithdrawal,
      recipientAddress,
      purpose: purpose ?? '',
      repidScore: kyaResult.repidScore,
      repidTier: kyaResult.repidTier,
      humanCustody: kyaResult.humanCustodyBound,
    };

    const bftProof = await bft.authorize(
      paymentId, agentName, amountUSDC, maxWithdrawal, purpose, authorizationContext
    );

    if (!bftProof.passed) {
      return NextResponse.json({
        approved: false,
        stage:  'bft_consensus',
        reason: bftProof.evaluated
          ? `BFT consensus failed: ${((bftProof.consensusWeight ?? 0) * 100).toFixed(1)}% < ${bftProof.threshold * 100}% required`
          : `BFT consensus NOT CHECKED: ${bftProof.notEvaluatedReason}`,
        bftProof,
      }, { status: 403 });
    }

    // Step 3: Solana Execution
    const execution = await solana.execute(
      amountUSDC, recipientAddress,
      {
        receiptId:         paymentId,
        agentName,
        repidScore:        kyaResult.repidScore,
        bftPassed:         bftProof.passed,
        bftWeight:         bftProof.consensusWeight,
        zkpProofCID:       kyaResult.zkpProofCID,
        ruleHash,
        insuranceCoverage: kyaResult.insuranceCoverage,
      }
    );

    // Step 4: Generate Compliance Receipt
    const receipt = await receipts.generate({
      kyaResult, bftProof, amountUSDC, recipientAddress,
      solanaTxHash:      execution.txHash,
      solanaExplorerUrl: execution.explorerUrl,
      ruleHash,
      simulated:         execution.simulated,
      confirmed:         execution.confirmed,
    });

    // Step 4b: queue the consensus evaluation. Only meaningful in observe mode
    // — in enforce mode the verdict is already on the proof above. Queued after
    // the receipt so bft_passed has somewhere to be written back to.
    if (!bftProof.evaluated) {
      await bft.enqueue(receipt.receiptId, authorizationContext);
    }

    // Step 5: Fireblocks Pre-Auth (demonstrates architecture)
    const fbPreAuth = await fireblocks.generatePreAuth(receipt);

    // Step 6: Update RepID — only if the reward has been EARNED.
    //
    // This was `updateRepID(agentName, 10, 'Successful compliant payment')`,
    // unconditional, directly beneath a response that could say `bft.evaluated:
    // false` and `settlement.simulated: true` on the same request. The payload
    // disclosed both absences; the write asserted the opposite, and the write is
    // the half that persists — into `repid_score`, and from there into
    // `repid_tier` and both spending limits, which bound the NEXT request.
    //
    // Defaults made it the normal path, not an edge case: BFT_ENFORCEMENT_MODE
    // defaults to observe (passed:true, evaluated:false) and the executor
    // simulates whenever AGENT_SOPHIA_SECRET_BYTES is absent. See lib/trustshell/reward.ts.
    const reward = rewardFor({
      consensusEvaluated:  bftProof.evaluated,
      consensusPassed:     bftProof.passed,
      settlementSimulated: execution.simulated,
      settlementConfirmed: execution.confirmed,
    });
    if (!isPermittedReward(reward.delta)) {
      throw new Error(`refusing an out-of-band RepID delta on the payment path: ${reward.delta}`);
    }
    if (reward.delta !== 0) {
      await kya.updateRepID(agentName, reward.delta, rewardReason(reward, amountUSDC));
    }

    // Say what actually happened. "executed" for a run that touched no chain,
    // or "consensus-authorized" for a check that never ran, is the failure this
    // repo keeps logging.
    const settlement = execution.simulated
      ? 'SIMULATED — no transaction was broadcast'
      : execution.confirmed
        ? 'confirmed on Solana devnet'
        : 'submitted to Solana devnet, not yet confirmed';

    return NextResponse.json({
      approved:     true,
      receipt,
      fireblocksPreAuth: fbPreAuth,
      explorerUrl:  execution.explorerUrl,
      settlement: {
        status:    execution.simulated ? 'simulated' : execution.confirmed ? 'confirmed' : 'submitted',
        simulated: execution.simulated,
        confirmed: execution.confirmed,
        error:     execution.error,
      },
      // What the RepID in this receipt was actually computed from. A score is
      // only as good as its evidence, so the evidence ships with it rather than
      // living in a log the caller never sees.
      // proven=false, always, until a prover runs. Surfaced rather than logged
      // so a caller cannot mistake a commitment for a proof.
      attestation: {
        proven:        zkpAttestation.proven,
        proofSystem:   zkpAttestation.proofSystem,
        commitment:    zkpAttestation.commitment,
        publicSignals: zkpAttestation.publicSignals,
        notAttested:   zkpAttestation.notAttested,
      },
      repid: {
        score: repidResult.repidScore,
        tier:  repidResult.repidTier,
        resolvedAgent: earned.resolvedAgent,
        fullyMeasured: earned.evidence.fullyMeasured,
        measured:      earned.evidence.measured,
        insufficient:  earned.evidence.insufficient,
        unmeasured:    earned.evidence.unmeasured,
        weakestConfidence: earned.evidence.weakestConfidence,
        observationsTruncated: earned.truncated,
        detail: earned.evidence.detail,
        // What this payment did or did not add to the score, and why. Withheld
        // is disclosed for the same reason `bft.evaluated:false` is: a silent
        // zero and an earned zero look identical to the caller otherwise.
        reward: {
          delta:    reward.delta,
          outcome:  reward.outcome,
          unmet:    reward.unmet,
          reason:   reward.reason,
        },
      },
      bft: {
        evaluated: bftProof.evaluated,
        status:    bftProof.evaluated ? (bftProof.passed ? 'passed' : 'failed') : 'NOT CHECKED',
        reason:    bftProof.notEvaluatedReason,
        mode:      bftEnforcementMode(),
        // In observe mode the verdict arrives later; say where to look for it
        // rather than leaving NOT CHECKED looking permanent.
        pending:   !bftProof.evaluated,
        resolvesVia: !bftProof.evaluated ? 'POST /api/trustrails/bft/process' : undefined,
      },
      message:
        `KYA-verified payment of ${amountUSDC} USDC by ${agentName} ` +
        `(RepID: ${kyaResult.repidScore}) — ${settlement}` +
        (bftProof.evaluated ? '' : '. BFT consensus NOT CHECKED.'),
    });

  } catch (error: any) {
    return NextResponse.json({
      approved: false,
      stage: 'execution',
      error: error.message,
    }, { status: 500 });
  }
}

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}


export const dynamic = 'force-dynamic';
