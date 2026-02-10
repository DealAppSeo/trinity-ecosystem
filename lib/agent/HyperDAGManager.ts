
import { v4 as uuidv4 } from 'uuid';

export enum DAGNodeStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface DAGNode {
    id: string;
    agent: string;
    instruction: string;
    status: DAGNodeStatus;
    dependencies: string[]; // IDs of parent nodes
    result?: string;
}

/**
 * HyperDAGManager
 * Manages Directed Acyclic Graphs of agent tasks for complex, parallel reasoning.
 */
export class HyperDAGManager {
    private nodes: Map<string, DAGNode> = new Map();

    constructor() { }

    /**
     * Create a new node in the DAG.
     */
    addNode(agent: string, instruction: string, dependencies: string[] = []): string {
        const id = `dag_${uuidv4().substring(0, 8)}`;
        const node: DAGNode = {
            id,
            agent,
            instruction,
            status: DAGNodeStatus.PENDING,
            dependencies
        };
        this.nodes.set(id, node);
        console.log(`[HyperDAG] 🏗️ Added node ${id} for ${agent}`);
        return id;
    }

    /**
     * Get the next executable nodes (those with all dependencies completed).
     */
    getRunnableNodes(): DAGNode[] {
        return Array.from(this.nodes.values()).filter(node => {
            if (node.status !== DAGNodeStatus.PENDING) return false;
            return node.dependencies.every(depId => {
                const dep = this.nodes.get(depId);
                return dep && dep.status === DAGNodeStatus.COMPLETED;
            });
        });
    }

    /**
     * Update node status and results.
     */
    updateNode(id: string, status: DAGNodeStatus, result?: string) {
        const node = this.nodes.get(id);
        if (node) {
            node.status = status;
            if (result) node.result = result;
            console.log(`[HyperDAG] 🔄 Node ${id} updated to ${status}`);
        }
    }

    /**
     * Export DAG state for logging.
     */
    exportDAG(): any {
        return Array.from(this.nodes.values());
    }
}
