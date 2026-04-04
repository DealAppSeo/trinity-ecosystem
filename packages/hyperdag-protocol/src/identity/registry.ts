/**
 * ERC-8004 Identity + Reputation Registries
 *
 * Patents: P-002, P-016
 * Contracts:
 *   Identity:   0x8004A818BFB912233c491871b3d84c89A494BD9e (Base Sepolia)
 *   Reputation: 0x8004B663056A597Dffe9eCcC1965A193B7388713 (Base Sepolia)
 */

export interface RepID {
  id: string;
  holder: string;            // wallet address or agent name
  reputationScore: number;   // 0-100
  credentialHashes: string[];
  issuedAt: number;
  expiresAt?: number;
  zkProofHash?: string;
}

export interface SBTCredential {
  tokenId: string;
  holder: string;
  credentialType: 'kyc' | 'kyb' | 'kya' | 'compliance' | 'reputation';
  issuer: string;
  chain: string;
  contractAddress: string;
  mintedAt: number;
  metadata: Record<string, unknown>;
}

export interface RegistryConfig {
  chainId: number;
  identityContract: string;
  reputationContract: string;
  rpcUrl?: string;
}

const DEFAULT_CONFIG: RegistryConfig = {
  chainId: 84532,
  identityContract: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  reputationContract: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
};

/**
 * Identity Registry — manages ERC-8004 identity credentials (SBTs).
 */
export class IdentityRegistry {
  private config: RegistryConfig;

  constructor(config: Partial<RegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async issueSBT(holder: string, credentialType: SBTCredential['credentialType'], metadata: Record<string, unknown> = {}): Promise<SBTCredential> {
    // Scaffold: returns a local credential object
    // Real implementation: calls identity contract via ethers/viem
    return {
      tokenId: `sbt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      holder,
      credentialType,
      issuer: 'hyperdag-protocol',
      chain: `base-sepolia:${this.config.chainId}`,
      contractAddress: this.config.identityContract,
      mintedAt: Date.now(),
      metadata,
    };
  }

  async verifySBT(tokenId: string): Promise<{ valid: boolean; credential?: SBTCredential }> {
    // Scaffold: placeholder verification
    // Real implementation: reads from on-chain contract
    return { valid: true };
  }
}

/**
 * Reputation Registry — manages RepID scores and reputation proofs.
 */
export class ReputationRegistry {
  private config: RegistryConfig;

  constructor(config: Partial<RegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getReputation(holder: string): Promise<RepID | null> {
    // Scaffold: placeholder lookup
    // Real implementation: reads from reputation contract
    return null;
  }

  async updateReputation(holder: string, delta: number, reason: string): Promise<RepID> {
    // Scaffold: creates a local RepID update
    return {
      id: `rep-${Date.now()}`,
      holder,
      reputationScore: Math.max(0, Math.min(100, 50 + delta)),
      credentialHashes: [],
      issuedAt: Date.now(),
    };
  }
}
