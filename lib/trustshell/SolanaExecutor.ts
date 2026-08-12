// lib/trustshell/SolanaExecutor.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction
} from '@solana/spl-token';

// A submitted transaction is not a confirmed one, and a failed submission is
// not a transaction at all. Callers need to tell those apart, so the result
// says which happened instead of always handing back a hash and a link.
export interface SolanaExecutionResult {
  /** Real signature, or null when nothing was broadcast. */
  txHash:      string | null;
  /** Only ever set for a real signature — never fabricated. */
  explorerUrl: string | null;
  /** True when the chain was not touched. */
  simulated:   boolean;
  /** True only after the network confirms. Submission alone is not confirmation. */
  confirmed:   boolean;
  /** Why it was simulated, when it was. */
  error?:      string;
}

export class SolanaExecutor {
  private connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  private usdcMint = new PublicKey(
    process.env.USDC_DEVNET_MINT || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'
  );
  private MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

  async execute(
    amountUSDC:      number,
    toAddress:       string,
    // The signing key comes from AGENT_SOPHIA_SECRET_BYTES below, not from a
    // caller-supplied string. The old `signerPrivKey` parameter was never read
    // — callers were passing AGENT_SOPHIA_PRIVKEY (the key recoverable from git
    // history) into a value that was discarded. Removed so nothing reads it.
    complianceData:  {
      receiptId:       string;
      agentName:       string;
      repidScore:      number;
      bftPassed:       boolean;
      bftWeight:       number | null;
      zkpProofCID:     string;
      ruleHash:        string;
      insuranceCoverage: number;
    }
  ): Promise<SolanaExecutionResult> {

    try {
      // Bypass bs58 for NextJS build by providing byte arrays instead
      const secretBytesStr = process.env.AGENT_SOPHIA_SECRET_BYTES;
      if (!secretBytesStr) throw new Error("Missing AGENT_SOPHIA_SECRET_BYTES array in environment");
      
      const secretKey = Uint8Array.from(JSON.parse(secretBytesStr));
      const signer  = Keypair.fromSecretKey(secretKey);
      
      const toKey   = new PublicKey(toAddress);
      const amount  = BigInt(Math.round(amountUSDC * 1_000_000)); // USDC 6 decimals

      const fromATA = await getOrCreateAssociatedTokenAccount(
        this.connection, signer, this.usdcMint, signer.publicKey
      );
      const toATA = await getOrCreateAssociatedTokenAccount(
        this.connection, signer, this.usdcMint, toKey
      );

      const transferIx = createTransferInstruction(
        fromATA.address, toATA.address, signer.publicKey, amount
      );

      // TrustShell compliance memo — on-chain proof
      // Compact format: every field is a compliance signal for the audit trail
      const memo = JSON.stringify({
        ts:  1,                                    // TrustShell protocol version
        rid: complianceData.receiptId,             // KYA receipt ID
        ag:  complianceData.agentName,             // Agent name
        rep: complianceData.repidScore,            // RepID at execution
        bft: complianceData.bftPassed ? 1 : 0,    // BFT consensus passed
        // Omitted entirely when unevaluated: a literal 0.000 in an on-chain
        // compliance memo would read as a measured weight.
        ...(complianceData.bftWeight !== null
          ? { bfw: Number(complianceData.bftWeight.toFixed(3)) }
          : {}),
        zkp: complianceData.zkpProofCID.slice(-8), // Last 8 chars of ZKP CID
        rh:  complianceData.ruleHash.slice(0, 8),  // First 8 chars of rule hash
        ins: complianceData.insuranceCoverage,     // Insurance coverage USD
        t:   Date.now(),                           // Unix timestamp
      });

      const memoIx = new TransactionInstruction({
        keys:      [],
        programId: this.MEMO_PROGRAM,
        data:      Buffer.from(memo, 'utf8'),
      });

      const tx = new Transaction().add(transferIx, memoIx);
      tx.feePayer      = signer.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.sign(signer);

      const txHash = await this.connection.sendRawTransaction(tx.serialize());

      // Confirmation was previously commented out while receipts still recorded
      // `confirmed`. Submission only means the RPC accepted the bytes; the
      // transaction can still fail. Confirm, and if confirmation does not land,
      // return the real signature with confirmed=false rather than assuming.
      let confirmed = false;
      try {
        const result = await this.connection.confirmTransaction(txHash, 'confirmed');
        confirmed = !result.value.err;
      } catch {
        confirmed = false;
      }

      return {
        txHash,
        explorerUrl: `https://explorer.solana.com/tx/${txHash}?cluster=devnet`,
        simulated: false,
        confirmed,
      };
    } catch (e: any) {
      // No transaction exists, so there is no hash and no explorer link. This
      // used to invent `mock_tx_hash_…` plus a real-looking Explorer URL, which
      // is how two rows in `kya_compliance_receipts` ended up marked
      // on_chain_verified against transactions that never happened.
      console.warn(
        `[SolanaExecutor] Execution failed (${e?.message ?? 'unknown'}). ` +
          'Returning simulated=true. No transaction was broadcast.'
      );
      return {
        txHash:      null,
        explorerUrl: null,
        simulated:   true,
        confirmed:   false,
        error:       e?.message ?? 'unknown error',
      };
    }
  }
}
