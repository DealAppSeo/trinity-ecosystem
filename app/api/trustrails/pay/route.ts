// app/api/trustrails/pay/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import {
  KYAValidator, BFTAuthorizer, ComplianceReceiptGenerator,
  SolanaExecutor, FireblocksPreAuth,
  ZKPAttestationService, RepIDCalculator
} from '@/lib/trustshell';
import { bftEnforcementMode } from '@/lib/trustshell/BFTAuthorizer';

export async function POST(req: NextRequest) {
  const { agentName, amountUSDC, recipientAddress, purpose, signatures } = await req.json();

  const kya        = new KYAValidator();
  const bft        = new BFTAuthorizer();
  const receipts   = new ComplianceReceiptGenerator();
  const solana     = new SolanaExecutor();
  const fireblocks = new FireblocksPreAuth();
  const zkp        = new ZKPAttestationService();
  const calc       = new RepIDCalculator();

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
    const institution = req.nextUrl.searchParams.get('institution') || 'default';
    const repidResult = await calc.calculate(
      agentName,
      {
        bftAccuracy:      94,
        veritasCatchRate: 97,
        x402SuccessRate:  100,
        latencyMs:        180,
        humanCustody:     kyaResult.humanCustodyBound,
      },
      institution
    );

    // Addendum 2: ZKP Attestation (Honest Stub)
    const zkpAttestation = await zkp.generateKYAAttestation(
      agentName,
      repidResult.repidScore,
      repidResult.threshold
    );

    kyaResult.repidScore = repidResult.repidScore;
    kyaResult.zkpProofCID = zkpAttestation.proofCID;

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

    const maxWithdrawal = kyaResult.repidScore > 7500 ? 100000 : 50000;

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
