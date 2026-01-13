export interface AgentBid {
    agentName: string;
    reputation: number;
    tier: number;
    bidScore: number; // 0-100
}

/**
 * 🧠 ANFIS BIDDER SYSTEM (Phase 1 Stub)
 * Simulates Fuzzy Logic selection based on Reputation and Tier.
 * 
 * Future Upgrade: Incorporate 'Cost Estimate' and 'Urgency' as inputs.
 */
export function anfisSelectWinner(agents: any[], taskType: string): string {
    if (!agents || agents.length === 0) return 'trinity-nexus'; // Default

    // 1. Filter capable agents (Simulated capability check)
    // Ideally we check agent metadata tags or capabilities.

    // 2. Score Bids
    const scoredBids: AgentBid[] = agents.map(agent => {
        let score = (agent.reputation_score || 0) + (agent.autonomy_tier || 1) * 10;

        // Boost for specialization (Simulated)
        if (taskType === 'code' && agent.agent_name.includes('constructor')) score += 50;
        if (taskType === 'design' && agent.agent_name.includes('architect')) score += 50;
        if (taskType === 'strategy' && agent.agent_name.includes('sophia')) score += 100;
        if (taskType === 'research' && agent.agent_name.includes('nexus')) score += 30;

        return {
            agentName: agent.agent_name,
            reputation: agent.reputation_score,
            tier: agent.autonomy_tier,
            bidScore: score
        };
    });

    // 3. Select Winner
    scoredBids.sort((a, b) => b.bidScore - a.bidScore);

    const winner = scoredBids[0];
    console.log(`[BIDDER] Winning Bid: ${winner.agentName} (Score: ${winner.bidScore})`);

    return winner.agentName;
}
