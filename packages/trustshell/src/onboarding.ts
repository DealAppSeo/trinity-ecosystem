/**
 * ZKP RepID Onboarding Flywheel
 *
 * Progressive trust verification: users start with email only (no wallet),
 * then upgrade through stages as they build reputation. Each stage unlocks
 * more capabilities. This is the highest-value user acquisition feature
 * because it removes the Web3 wallet barrier entirely for Stage 1.
 *
 * Flywheel Stages:
 *   Stage 1: Email only → DBT (Dynamic Bound Token) in DB
 *   Stage 2: Email + Phone (2FA) → DBT with elevated trust
 *   Stage 3: Email + Phone + ID doc (3FA) → DBT ready for SBT conversion
 *   Stage 4: Email + Phone + ID + Wallet (4FA) → SBT minted on-chain
 *   Stage 5: SBT + ZKP proof generated → Full RepID credential
 *
 * The key insight: users accumulate reputation from Stage 1 onward.
 * By the time they connect a wallet (Stage 4), they already have
 * verified history, making the SBT meaningful from day one.
 */

import { createRepIDCredential, type RepIDCredential } from './repid';
import { createZKPProof, type ZKPProofResult } from './zkp';

// ─── Stage Definitions ───

export type OnboardingStage = 1 | 2 | 3 | 4 | 5;

export interface OnboardingState {
  /** Unique user ID (UUID from Supabase auth or generated) */
  userId: string;
  /** Current onboarding stage */
  stage: OnboardingStage;
  /** Email (required from Stage 1) */
  email: string;
  /** Phone verified (Stage 2+) */
  phoneVerified: boolean;
  /** Identity document verified (Stage 3+) */
  idDocVerified: boolean;
  /** Wallet address connected (Stage 4+) */
  wallet: string | null;
  /** DBT record ID in Supabase */
  dbtId: string | null;
  /** SBT token ID on-chain (Stage 4+) */
  sbtTokenId: string | null;
  /** ZKP proof hash (Stage 5) */
  zkpProofHash: string | null;
  /** RepID credential (built progressively) */
  credential: RepIDCredential | null;
  /** Reputation score accumulated since Stage 1 */
  accumulatedScore: number;
  /** Actions taken (for reputation building before wallet) */
  actions: OnboardingAction[];
  /** ISO timestamp of onboarding start */
  startedAt: string;
  /** ISO timestamp of last stage transition */
  lastTransition: string;
}

export interface OnboardingAction {
  type: 'signup' | 'verify_email' | 'verify_phone' | 'verify_id' | 'connect_wallet' | 'complete_task' | 'refer_user';
  timestamp: string;
  scoreContribution: number;
  metadata?: Record<string, unknown>;
}

export interface StageRequirements {
  stage: OnboardingStage;
  label: string;
  factors: string[];
  unlocks: string[];
  minScore: number;
}

// ─── Stage Configuration ───

export const STAGE_CONFIG: StageRequirements[] = [
  {
    stage: 1,
    label: 'Email Verified',
    factors: ['email'],
    unlocks: ['View trust dashboard', 'Browse public attestations', 'Start building reputation'],
    minScore: 0
  },
  {
    stage: 2,
    label: '2FA Verified',
    factors: ['email', 'phone'],
    unlocks: ['Submit compliance documents', 'Join trust networks', 'Refer others'],
    minScore: 10
  },
  {
    stage: 3,
    label: '3FA Verified',
    factors: ['email', 'phone', 'id_document'],
    unlocks: ['Request attestations', 'DBT ready for SBT conversion', 'CRE property verification'],
    minScore: 25
  },
  {
    stage: 4,
    label: '4FA + Wallet',
    factors: ['email', 'phone', 'id_document', 'wallet'],
    unlocks: ['SBT minted on-chain', 'On-chain reputation', 'x402 payments', 'BYOK'],
    minScore: 40
  },
  {
    stage: 5,
    label: 'Full ZKP RepID',
    factors: ['email', 'phone', 'id_document', 'wallet', 'zkp_proof'],
    unlocks: ['Prove reputation without revealing score', 'Cross-chain portable identity', 'Full HyperDAG protocol access'],
    minScore: 60
  }
];

// ─── Core Functions ───

/**
 * Initialize a new onboarding state for a user (Stage 1 — email only).
 * No wallet required. User starts building reputation immediately.
 */
export function initOnboarding(email: string, userId?: string): OnboardingState {
  const id = userId || generateUserId();
  return {
    userId: id,
    stage: 1,
    email,
    phoneVerified: false,
    idDocVerified: false,
    wallet: null,
    dbtId: null,
    sbtTokenId: null,
    zkpProofHash: null,
    credential: null,
    accumulatedScore: 5, // Starting score for signup
    actions: [{
      type: 'signup',
      timestamp: new Date().toISOString(),
      scoreContribution: 5
    }],
    startedAt: new Date().toISOString(),
    lastTransition: new Date().toISOString()
  };
}

/**
 * Advance to the next onboarding stage if requirements are met.
 * Returns the updated state or throws if requirements not met.
 */
export function advanceStage(state: OnboardingState): OnboardingState {
  const nextStage = (state.stage + 1) as OnboardingStage;
  if (nextStage > 5) {
    throw new Error('Already at maximum stage (5)');
  }

  const requirements = STAGE_CONFIG[nextStage - 1];
  const errors: string[] = [];

  // Check factor requirements
  if (requirements.factors.includes('email') && !state.email) errors.push('Email required');
  if (requirements.factors.includes('phone') && !state.phoneVerified) errors.push('Phone verification required');
  if (requirements.factors.includes('id_document') && !state.idDocVerified) errors.push('ID document verification required');
  if (requirements.factors.includes('wallet') && !state.wallet) errors.push('Wallet connection required');
  if (requirements.factors.includes('zkp_proof') && !state.zkpProofHash) errors.push('ZKP proof required');

  // Check minimum score
  if (state.accumulatedScore < requirements.minScore) {
    errors.push(`Minimum score ${requirements.minScore} required (current: ${state.accumulatedScore})`);
  }

  if (errors.length > 0) {
    throw new Error(`Cannot advance to Stage ${nextStage}: ${errors.join(', ')}`);
  }

  const updated = { ...state };
  updated.stage = nextStage;
  updated.lastTransition = new Date().toISOString();

  // Stage 4: Create the RepID credential now that wallet is available
  if (nextStage === 4 && state.wallet) {
    updated.credential = createRepIDCredential({
      did: `did:hyperdag:human:${state.userId}`,
      score: state.accumulatedScore,
      wallet: state.wallet,
      chain: 'base-sepolia'
    });
  }

  return updated;
}

/**
 * Record an action that contributes to the user's reputation score.
 * Works from Stage 1 onward — no wallet needed.
 */
export function recordAction(
  state: OnboardingState,
  type: OnboardingAction['type'],
  scoreContribution: number,
  metadata?: Record<string, unknown>
): OnboardingState {
  const action: OnboardingAction = {
    type,
    timestamp: new Date().toISOString(),
    scoreContribution: Math.max(0, scoreContribution),
    metadata
  };

  const updated = { ...state };
  updated.actions = [...state.actions, action];
  updated.accumulatedScore = Math.min(100, state.accumulatedScore + scoreContribution);

  // Update credential score if it exists (Stage 4+)
  if (updated.credential) {
    updated.credential = createRepIDCredential({
      did: updated.credential.did,
      score: updated.accumulatedScore,
      wallet: updated.credential.wallet,
      chain: updated.credential.chain
    });
  }

  return updated;
}

/**
 * Mark a verification factor as completed.
 */
export function completeVerification(
  state: OnboardingState,
  factor: 'phone' | 'id_document' | 'wallet',
  value?: string
): OnboardingState {
  const updated = { ...state };
  const scoreMap: Record<string, number> = { phone: 10, id_document: 15, wallet: 20 };

  switch (factor) {
    case 'phone':
      updated.phoneVerified = true;
      break;
    case 'id_document':
      updated.idDocVerified = true;
      break;
    case 'wallet':
      if (!value) throw new Error('Wallet address required');
      updated.wallet = value;
      break;
  }

  return recordAction(updated, `verify_${factor}` as OnboardingAction['type'], scoreMap[factor] || 5);
}

/**
 * Generate a ZKP proof for a Stage 4+ user, advancing them to Stage 5.
 */
export async function generateRepIDProof(state: OnboardingState): Promise<{
  state: OnboardingState;
  proof: ZKPProofResult;
}> {
  if (!state.credential || !state.wallet) {
    throw new Error('Credential and wallet required (Stage 4+) before generating ZKP proof');
  }

  const proof = await createZKPProof({
    proofType: 'repid_credential',
    privateInputs: {
      actualScore: state.accumulatedScore,
      email: state.email,
      userId: state.userId
    },
    publicInputs: {
      did: state.credential.did,
      minScore: 60,
      tier: state.credential.tier,
      wallet: state.wallet
    }
  });

  const updated = { ...state };
  if (proof.success && proof.proof) {
    updated.zkpProofHash = proof.proof;
    if (updated.credential) {
      updated.credential.zkpProofHash = proof.proof;
    }
  }

  return { state: updated, proof };
}

/**
 * Get the current stage requirements and what the user still needs to do.
 */
export function getOnboardingStatus(state: OnboardingState): {
  currentStage: StageRequirements;
  nextStage: StageRequirements | null;
  missingForNext: string[];
  progressPercent: number;
} {
  const current = STAGE_CONFIG[state.stage - 1];
  const next = state.stage < 5 ? STAGE_CONFIG[state.stage] : null;

  const missing: string[] = [];
  if (next) {
    if (next.factors.includes('phone') && !state.phoneVerified) missing.push('Verify phone number');
    if (next.factors.includes('id_document') && !state.idDocVerified) missing.push('Upload ID document');
    if (next.factors.includes('wallet') && !state.wallet) missing.push('Connect wallet');
    if (next.factors.includes('zkp_proof') && !state.zkpProofHash) missing.push('Generate ZKP proof');
    if (state.accumulatedScore < next.minScore) missing.push(`Reach score ${next.minScore} (current: ${state.accumulatedScore})`);
  }

  return {
    currentStage: current,
    nextStage: next,
    missingForNext: missing,
    progressPercent: Math.round((state.stage / 5) * 100)
  };
}

// ─── Helpers ───

function generateUserId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
