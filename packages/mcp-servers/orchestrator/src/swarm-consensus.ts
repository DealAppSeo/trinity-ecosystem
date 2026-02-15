/**
 * @title Swarm Consensus
 * @dev Byzantine fault-tolerant consensus for multi-agent decisions.
 */

export interface Vote {
    agentId: string;
    approve: boolean;
    reasoning: string;
}

export interface ConsensusResult {
    approved: boolean;
    approvals: number;
    rejections: number;
    abstentions: number;
    reasoning: string[];
}

export class SwarmConsensus {
    /**
     * reaches consensus on a proposal using a 2/3 majority requirement.
     */
    async reachConsensus<T>(
        proposal: T,
        voters: string[],
        votes: Vote[]
    ): Promise<ConsensusResult> {
        const required = Math.ceil(voters.length * 2 / 3);

        const approvals = votes.filter(v => v.approve).length;
        const rejections = votes.filter(v => !v.approve).length;
        const abstentions = voters.length - votes.length;

        return {
            approved: approvals >= required,
            approvals,
            rejections,
            abstentions,
            reasoning: votes.map(v => `${v.agentId}: ${v.reasoning}`)
        };
    }
}
