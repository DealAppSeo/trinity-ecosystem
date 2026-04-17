/**
 * TrustTrader Merkle RepID Commitment
 * Creates Merkle trees from trade decisions for on-chain proof.
 */

import { MerkleTree } from 'merkletreejs';
import { keccak256, encodePacked, type Hex, toHex } from 'viem';

export interface MerkleLeafData {
  agentId: bigint;
  decision: 'EXECUTE' | 'REFUSED';
  unityScore: string;
  dissonance: string;
  timestamp: bigint;
  signature: Hex;
}

export interface MerkleCommitment {
  root: string;
  leafHash: string;
  proof: string[];
  treeDepth: number;
}

// In-memory tree storage (per session)
let leaves: Buffer[] = [];

function hashLeaf(data: MerkleLeafData): Buffer {
  const hash = keccak256(
    encodePacked(
      ['uint256', 'string', 'string', 'string', 'uint256', 'bytes'],
      [data.agentId, data.decision, data.unityScore, data.dissonance, data.timestamp, data.signature]
    )
  );
  return Buffer.from(hash.slice(2), 'hex');
}

function keccak256Buffer(data: Buffer): Buffer {
  const hex = ('0x' + data.toString('hex')) as Hex;
  const hash = keccak256(hex);
  return Buffer.from(hash.slice(2), 'hex');
}

/**
 * Add a trade decision to the Merkle tree and return the commitment.
 */
export function addLeafAndCommit(data: MerkleLeafData): MerkleCommitment {
  const leaf = hashLeaf(data);
  leaves.push(leaf);

  const tree = new MerkleTree(leaves, keccak256Buffer, { sortPairs: true });
  const root = tree.getHexRoot();
  const proof = tree.getHexProof(leaf);

  return {
    root,
    leafHash: '0x' + leaf.toString('hex'),
    proof,
    treeDepth: tree.getDepth(),
  };
}

/**
 * Get current Merkle root without adding a new leaf.
 */
export function getCurrentRoot(): string {
  if (leaves.length === 0) return '0x0';
  const tree = new MerkleTree(leaves, keccak256Buffer, { sortPairs: true });
  return tree.getHexRoot();
}

/**
 * Reset the tree (for testing or new epoch).
 */
export function resetTree(): void {
  leaves = [];
}

/**
 * Get leaf count.
 */
export function getLeafCount(): number {
  return leaves.length;
}
