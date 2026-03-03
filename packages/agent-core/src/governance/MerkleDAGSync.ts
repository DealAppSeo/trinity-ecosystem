import { createHash } from 'crypto';

/**
 * Patent #1: Merkle-DAG State Synchronization
 * Allows agents to quickly prove what state they have seen without sharing the whole log.
 */
export class MerkleDAGSync {
    /**
     * Generate a state digest (Simulated Bloom Filter using a Set/Array for MVP stability).
     */
    static generateStateDigest(itemHashes: string[]): string[] {
        // In full production, this returns a Bloom Filter bit-array
        return [...new Set(itemHashes)];
    }

    /**
     * Compare two digests to find potential missing items (BFT Sync).
     */
    static findDiff(localHashes: string[], remoteDigest: string[]): string[] {
        const remoteSet = new Set(remoteDigest);
        // Returns items that the REMOTE is missing
        return localHashes.filter(h => !remoteSet.has(h));
    }

    /**
     * Compute the Merkle Root for a batch of agent interactions.
     */
    static computeMerkleRoot(hashes: string[]): string {
        if (hashes.length === 0) return createHash('sha256').update('empty').digest('hex');
        if (hashes.length === 1) return hashes[0];

        const nextLevel: string[] = [];
        for (let i = 0; i < hashes.length; i += 2) {
            const left = hashes[i];
            const right = hashes[i + 1] || left;
            nextLevel.push(createHash('sha256').update(left + right).digest('hex'));
        }
        return this.computeMerkleRoot(nextLevel);
    }
}
