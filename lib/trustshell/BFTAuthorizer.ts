export class BFTAuthorizer {
  async authorize(
    paymentId: string,
    agentName: string,
    amountUSDC: number,
    maxWithdrawal: number,
    action: string
  ): Promise<{ passed: boolean; consensusWeight: number; threshold: number }> {
    // Stub implementation to satisfy VaultPermission.ts imports
    return {
      passed: true,
      consensusWeight: 1.0,
      threshold: 0.67
    };
  }
}
