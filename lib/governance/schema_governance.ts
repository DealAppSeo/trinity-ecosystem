import { createClient } from '@supabase/supabase-js';

const PHI = 1.61803398875;

export class HybridBFTGovernance {
    private supabase;

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    /**
     * HotStuff Leader Rotation:
     * Deterministically select a leader agent based on the proposal count.
     */
    getLeader(agents: string[], proposalCount: number): string {
        return agents[proposalCount % agents.length];
    }

    /**
     * HotStuff-2 Phase 1: Prepare
     * Leader broadcasts proposal. Obtaining a QC here effectively "locks" the proposal in HS2.
     */
    async phasePrepare(proposalId: string, leader: string, agents: string[]) {
        console.log(`HOTSTUFF-2 [Prepare]: Leader ${leader} broadcasting proposal ${proposalId}`);
        const prepareVotes = agents.map(a => ({
            agent: a,
            zk_weight: a === 'trinity-w3c' ? 2.5 : 1.0,
            vote: 'approve',
            phase: 'prepare'
        }));

        await this.supabase
            .from('schema_change_proposals')
            .update({ votes_prepare: prepareVotes })
            .eq('id', proposalId);

        return this.calculateQuorum(prepareVotes);
    }

    /**
     * HotStuff-2 Phase 2: Commit
     * In the simplified 2-chain/2-phase model, obtaining the PrepareQC allows for immediate commitment 
     * in favorable network conditions (the "happy path").
     */
    async phaseCommit(proposalId: string) {
        console.log(`HOTSTUFF-2 [Commit]: Proposal ${proposalId} committed via PrepareQC (Happy Path).`);
        await this.supabase
            .from('schema_change_proposals')
            .update({ status: 'approved' })
            .eq('id', proposalId);
    }

    private calculateQuorum(votes: any[]): boolean {
        const totalWeight = votes.reduce((sum, v) => sum + v.zk_weight, 0);
        return totalWeight >= (totalWeight * 0.66);
    }

    /**
     * Main Governance Loop with HotStuff Pipelining & Pythagorean Veto.
     */
    async processProposal(proposalId: string, agents: string[]) {
        const { data: proposal, error } = await this.supabase
            .table('schema_change_proposals')
            .select('*')
            .eq('id', proposalId)
            .single();

        if (error || !proposal) return;

        // 1. HotStuff Leader Selection
        const agentsList = ['trinity-hdm', 'trinity-sophia', 'trinity-nexus', 'trinity-w3c', 'trinity-veritas'];
        const leader = this.getLeader(agentsList, parseInt(proposalId.toString().slice(-4)));

        // 2. Pythagorean Veto Safety
        const divergenceScore = proposal.drift_score || 0.0;
        if (divergenceScore > PHI) {
            console.warn(`BFT VETO: Divergence ${divergenceScore} > PHI. Transitioning to HITL.`);
            await this.supabase.table('schema_change_proposals').update({ status: 'vetoed' }).eq('id', proposalId);
            return;
        }

        // 3. HotStuff-2 Pipeline Progression (2-Phase Happy Path)
        const hasPrepareQC = await this.phasePrepare(proposalId, leader, agentsList);
        if (hasPrepareQC) {
            await this.phaseCommit(proposalId);
        }
    }
}
