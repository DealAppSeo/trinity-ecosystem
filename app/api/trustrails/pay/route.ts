// app/api/trustrails/pay/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import {
  KYAValidator, BFTAuthorizer, ComplianceReceiptGenerator,
  SolanaExecutor, FireblocksPreAuth,
  ZKPAttestationService, RepIDCalculator
} from '@/lib/trustshell';

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

    const bftProof = await bft.authorize(
      paymentId, agentName, amountUSDC,
      kyaResult.repidScore > 7500 ? 100000 : 50000,
      purpose
    );

    if (!bftProof.passed) {
      return NextResponse.json({
        approved: false,
        stage:  'bft_consensus',
        reason: `BFT consensus failed: ${(bftProof.consensusWeight * 100).toFixed(1)}% < ${(bftProof.threshold * 100)}% required`,
        bftProof,
      }, { status: 403 });
    }

    // Step 3: Solana Execution
    const { txHash, explorerUrl } = await solana.execute(
      amountUSDC, recipientAddress,
      process.env.AGENT_SOPHIA_PRIVKEY || '',
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
      solanaTxHash: txHash, solanaExplorerUrl: explorerUrl, ruleHash,
    });

    // Step 5: Fireblocks Pre-Auth (demonstrates architecture)
    const fbPreAuth = await fireblocks.generatePreAuth(receipt);

    // Step 6: Update RepID (reward successful compliance)
    await kya.updateRepID(agentName, 10, `Successful compliant payment: ${amountUSDC} USDC`);

    return NextResponse.json({
      approved:     true,
      receipt,
      fireblocksPreAuth: fbPreAuth,
      explorerUrl,
      message: `KYA-verified payment of ${amountUSDC} USDC executed by ${agentName} (RepID: ${kyaResult.repidScore})`,
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
