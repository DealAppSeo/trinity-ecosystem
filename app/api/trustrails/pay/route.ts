// app/api/trustrails/pay/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import {
  KYAValidator, BFTAuthorizer, ComplianceReceiptGenerator,
  SolanaExecutor, FireblocksPreAuth,
  ZKPAttestationService, RepIDCalculator,
  CustodyShadow, PAY_AUDIENCE, PAY_CAPABILITY, PAY_ACTION,
} from '@/lib/trustshell';
import { bftEnforcementMode } from '@/lib/trustshell/BFTAuthorizer';
import { EarnedMetricsRepository } from '@/lib/trustshell/EarnedMetricsRepo';
import { toScoringInputs } from '@/lib/trustshell/EarnedMetrics';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  evaluateContractedPayment,
  mayApproveAfterContract,
} from '@/lib/trustshell/identity/payment-contract';

export async function POST(req: NextRequest) {
  const { agentName, amountUSDC, recipientAddress, purpose, signatures, controlProof } = await req.json();

  const kya        = new KYAValidator();
  const bft        = new BFTAuthorizer();
  const receipts   = new ComplianceReceiptGenerator();
  const solana     = new SolanaExecutor();
  const fireblocks = new FireblocksPreAuth();
  const zkp        = new ZKPAttestationService();
  const calc       = new RepIDCalculator();
  const earnedMetrics = new EarnedMetricsRepository();
  // Lazy client, per lib/CLAUDE.md — a getter, not a field initialiser holding a
  // live client, so nothing is constructed at import time.
  const custodyShadow = new CustodyShadow(() => getSupabaseAdmin(), undefined, PAY_AUDIENCE, PAY_CAPABILITY, PAY_ACTION);

  // NEXT.md Tier 1 §1 / SPRINT-DECISIONS P2 — the holder path for ControlProof
  // on this route, in shadow mode. Generated here rather than at its original
  // spot (just before the BFT step) so the shadow observation below has a
  // stable identifier; nothing downstream depended on the old placement.
  const paymentId = crypto.randomUUID();

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

    // ---- SHADOW MODE (NEXT.md Tier 1 §1 / SPRINT-DECISIONS P2) -------------
    // Observe what a ControlProof would decide at this gate, record it, and
    // change nothing. `kyaResult.humanCustodyBound` below is still the live
    // signal that feeds the RepID calculation and the receipt. `observe` never
    // throws — an observability path that can break a payment is worse than no
    // observability. Every payment "requires custody" for this comparison:
    // unlike VaultPermission's per-vault flag, this route has no per-payment
    // opt-out, so treating the legacy signal as authoritative whenever it is
    // read is the honest mapping, not an assumption this shadow adds.
    //
    // Expect `not_comparable` on essentially every observation at first:
    // nothing presents a proof yet. That is the measurement, not a failure.
    await custodyShadow.observe({
      agentName,
      vaultId: paymentId,
      legacyCustodyVerified: kyaResult.humanCustodyBound,
      vaultRequiresCustody: true,
      controlProof,
    });

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
    // paymentId generated at the top of the handler now — see the shadow-mode
    // comment above for why.
    const ruleHash  = await sha256(`${agentName}:${amountUSDC}:${recipientAddress}:${purpose}`);

    // A FOURTH tier ladder lived here: `repidScore > 7500 ? 100000 : 50000`.
    // Exclusive where TIER_FLOORS is inclusive, so an agent at exactly 7500 was
    // Platinum by the ladder and Gold by this line — and every Silver and
    // Bronze agent was handed Gold's per-transaction figure, 50000 against a
    // real Bronze limit of 100. The panel weighs this number, so a wrong one is
    // a wrong brief. Same defect as the two disagreeing ladders, third
    // recurrence; same fix, which is to delete the second implementation.
    //
    // THE REPLACEMENT REINTRODUCED IT FROM THE OTHER SIDE, and the comment above
    // is why that is worth spelling out. `TIER_LIMITS[tierForScore(score)].perTx`
    // is the RIGHT ladder — applied to a row the ladder did not write.
    // `KYAValidator.validate()` enforces the STORED `spending_limit_per_tx`, and
    // for the 9 of 12 live rows written by the previous ladder the two diverge:
    // measured 2026-08-17, TORCH is enforced at 5,000 while the panel was told
    // 100,000, a 20x overstatement; five agents 10x, three 2x.
    //
    // So the brief is now the enforced number itself, read from the decision
    // that will actually be applied. This changes NO limit — reconciling the row
    // with the ladder is the open operator decision recorded in
    // `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`, and briefing a reviewer with a
    // ceiling nobody will enforce is not a way of taking it.
    //
    // AND THE OLD BRIEF USED A DIFFERENT SCORE AS WELL AS A DIFFERENT SOURCE.
    // `kyaResult.repidScore` is overwritten above with `repidResult.repidScore`,
    // recomputed from live metrics — so the deleted expression applied the
    // ladder to a score that no stored limit was ever derived from. The 20x
    // figure quoted above is the ladder applied to the STORED score; the actual
    // runtime brief was a third number, and it is not measurable from outside a
    // live request. Both divergences close the same way: read the number that
    // will be enforced instead of deriving one.
    //
    // `enforcedPerTxLimit` is `number | null`, null meaning NOT EVALUATED. It
    // cannot be null here — `validate()` only sets `kya_verified: true` on the
    // path that populates it, and line 30 returns on `!kya_verified` — but that
    // is an invariant across two files, so it is CHECKED rather than asserted
    // away with `!`. A wrong `!` here would hand the panel `null` typed as a
    // number, which is the fabricated-bound failure this whole change removes.
    if (kyaResult.enforcedPerTxLimit === null) {
      return NextResponse.json({
        authorized: false,
        error: 'per-transaction ceiling NOT_CHECKED',
        message:
          'KYA validation reported verified without a per-transaction ceiling. That combination ' +
          'should be unreachable; refusing rather than briefing the authorization panel with a ' +
          'bound nobody evaluated.',
      }, { status: 503 });
    }
    const maxWithdrawal = kyaResult.enforcedPerTxLimit;

    // LIVE CALLER. The spine existed; this route used to approve without it.
    // Fail closed if the contracted path is not invoked or does not VERIFIED.
    // BFT stays observe-only after this — this is not flipping #95 or BFT.
    const contracted = await evaluateContractedPayment({
      brief: {
        paymentId,
        agentName,
        amountUSDC,
        recipientAddress,
        purpose: purpose ?? '',
      },
      env: process.env,
    });
    if (!mayApproveAfterContract(contracted)) {
      return NextResponse.json({
        approved: false,
        stage: 'contracted_evaluation',
        reason: contracted.invoked
          ? `contracted evaluator ${contracted.outcome}`
          : contracted.reason,
        contracted,
      }, { status: contracted.invoked ? 403 : 503 });
    }

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

    // Step 6: Update RepID (reward successful compliance)
    await kya.updateRepID(agentName, 10, `Successful compliant payment: ${amountUSDC} USDC`);

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
      },
      contracted,
      floorDecay: earned.floorDecay ?? null,
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
