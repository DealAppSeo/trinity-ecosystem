/**
 * MerkleDAG (Content-Addressed Directed Acyclic Graph)
 * Based on ai_trinity_symphony_security_architecture_v2.md
 */

import { createHash } from 'crypto';

export interface DAGNode {
    hash: string;
    parents: string[];
    content: any;
    timestamp: string;
}

export class MerkleDAG {
    private nodes: Map<string, DAGNode> = new Map();

    /**
     * Adds a node to the DAG. Content-addressed using SHA-256.
     */
    addNode(content: any, parents: string[] = []): DAGNode {
        const timestamp = new Date().toISOString();
        const dataToHash = JSON.stringify({ content, parents, timestamp });
        const hash = createHash('sha256').update(dataToHash).digest('hex');

        const node: DAGNode = {
            hash,
            parents,
            content,
            timestamp
        };

        this.nodes.set(hash, node);
        console.log(`[MerkleDAG] 🛡️ Added node ${hash.substring(0, 8)} with ${parents.length} parents.`);
        return node;
    }

    /**
     * Verifies the integrity of a node by checking its hash.
     */
    verifyNode(hash: string): boolean {
        const node = this.nodes.get(hash);
        if (!node) return false;

        const dataToHash = JSON.stringify({ content: node.content, parents: node.parents, timestamp: node.timestamp });
        const expectedHash = createHash('sha256').update(dataToHash).digest('hex');
        return hash === expectedHash;
    }

    getNode(hash: string): DAGNode | undefined {
        return this.nodes.get(hash);
    }

    /**
     * Returns the full lineage (parents) of a node.
     */
    getLineage(hash: string): DAGNode[] {
        const lineage: DAGNode[] = [];
        const queue: string[] = [hash];
        const visited: Set<string> = new Set();

        while (queue.length > 0) {
            const currentHash = queue.shift()!;
            if (visited.has(currentHash)) continue;
            visited.add(currentHash);

            const node = this.nodes.get(currentHash);
            if (node) {
                lineage.push(node);
                queue.push(...node.parents);
            }
        }

        return lineage;
    }
}
