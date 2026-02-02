
import { Task } from '../agent/types';
import { supabaseAdmin as supabase } from '../supabase';

/**
 * FactCheckSwarm: BFT-based Truth Verification
 * Implements Grok's recommendation for a fact-checking swarm.
 */
export class FactCheckSwarm {
    private verifierAgents = ['trinity-veritas', 'trinity-shofet', 'trinity-gcm'];

    /**
     * Audit a claim using the swarm.
     * @param claim The text or fact to verify
     * @param context Optional context (e.g. source URL)
     */
    async auditClaim(claim: string, context?: string) {
        console.log(`[FactCheckSwarm] 🔎 Auditing claim: "${claim.substring(0, 50)}..."`);

        // 1. Spawn verification tasks for the verifier agents
        const taskPromises = this.verifierAgents.map(agent =>
            this.spawnVerificationTask(agent, claim, context)
        );

        const tasks = await Promise.all(taskPromises);

        return {
            status: 'pending',
            auditId: tasks[0]?.id ? `FC-${tasks[0].id}` : 'queued',
            verifiers: this.verifierAgents
        };
    }

    private async spawnVerificationTask(agent: string, claim: string, context?: string) {
        const { data, error } = await supabase.from('trinity_tasks').insert({
            title: `[FACT-CHECK] ${claim.substring(0, 30)}...`,
            description: `Verify the following claim for truthfulness: \n\n"${claim}"\n\nContext: ${context || 'None'}\n\nDeliverable: A score (0-1) and brief citation.`,
            task_type: 'review',
            assigned_to: agent,
            priority: 95,
            status: 'pending',
            metadata: {
                claim: claim,
                is_fact_check: true,
                required_consensus: 2 // 2/3 BFT
            }
        }).select('id').single();

        if (error) {
            console.error(`[FactCheckSwarm] Error spawning task for ${agent}:`, error.message);
            return null;
        }
        return data;
    }

    /**
     * Calculate BFT Consensus for a fact-check
     * @param taskId The parent task ID
     */
    async resolveConsensus(taskId: string) {
        // Query signatures/reviews for sub-tasks
        const { data: reviews, error } = await supabase
            .from('trinity_tasks')
            .select('verification_result, verification_details, last_output')
            .eq('metadata->parent_task_id', taskId);

        if (error || !reviews || reviews.length < 2) return null;

        const validVotes = reviews.filter(r => r.verification_result === 'VALID').length;
        const totalVotes = reviews.length;

        const isVerified = validVotes >= 2; // 2/3 BFT

        return {
            verified: isVerified,
            confidence: validVotes / totalVotes,
            votes: `${validVotes}/${totalVotes}`,
            timestamp: new Date().toISOString()
        };
    }
}

export const factCheckSwarm = new FactCheckSwarm();
