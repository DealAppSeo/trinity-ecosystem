import { supabase } from './supabase';
import { AgentRegistryRecord, Task } from './agent/types';
import { anfisBidScore } from './anfis-bid-resolver';

// ============================================
// TRINITY BIDDER SYSTEM
// Handles "Marketplace" Arbitration for Tasks
// ============================================

export interface Bid {
    agent: string;
    cost: number;        // Renamed from cost_estimate to match ANFIS
    efficiency: number;  // Renamed from efficiency_score
    redundancy: number;  // Changed to number 0-1 (was string plan)
    flexibility: number; // Renamed from flexibility_rating
    proposal: string;
    // Metadata can hold the text plan if needed
    redundancy_plan_text?: string;
}

export interface AuctionResult {
    winner: string;
    winning_bid: Bid;
    score: number;
    all_bids: Bid[];
}

/**
 * Runs an Arbitrage Auction for a specific task.
 * @param task The task to be auctioned.
 * @param service Service type ('execute' | 'research' | 'verify')
 */
export async function runArbitrageAuction(task: Task, service: 'execute' | 'research' | 'verify' = 'execute'): Promise<AuctionResult | null> {
    console.log(`[BIDDER] 🔨 Opening Auction for Task: ${task.title} (${service})`);

    // 1. Bilateral Bid Collection
    const bids = await collectBids(task, service);

    if (bids.length === 0) {
        console.warn(`[BIDDER] ⚠️ No bids received for ${task.id}`);
        return null;
    }

    // 2. Resolve Winner via ANFIS Logic
    const result = resolveAuction(bids);

    // 3. Assign Task & Log
    if (result) {
        console.log(`[BIDDER] 🏆 Winner: ${result.winner} (Score: ${result.score.toFixed(2)})`);
        console.log(`[BIDDER]    Proposal: ${result.winning_bid.proposal}`);

        // Update Task
        await supabase.from('trinity_tasks').update({
            assigned_to: result.winner,
            status: 'pending', // Re-trigger pending so agent picks it up explicitly
            metadata: JSON.stringify({
                auction_id: Date.now(),
                winning_bid: result.winning_bid,
                arbitrage_score: result.score
            })
        }).eq('id', task.id);

        // Log Bids for Sticky Loop Learning
        const bidLogs = result.all_bids.map(b => ({
            task_id: task.id,
            agent_name: b.agent,
            bid: b,
            score: calculateScore(b),
            status: b.agent === result.winner ? 'won' : 'lost'
        }));

        await supabase.from('trinity_bids').insert(bidLogs);
    }

    return result;
}

/**
 * Simulates active agents formulating bids based on their Profile/RepID.
 */
async function collectBids(task: Task, service: string): Promise<Bid[]> {
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .or('status.eq.active,status.eq.idle')
        .order('reputation_score', { ascending: false });

    if (!agents) return [];

    const bids: Bid[] = [];

    for (const agent of agents as AgentRegistryRecord[]) {
        if (agent.agent_name.includes('veritas') && service !== 'verify' && !task.title.includes('Verify')) continue;

        const rep = agent.reputation_score || 0;
        const flexibility = rep > 50 ? 0.9 : 0.2;

        let proposal = `Execute ${service} using standard protocol.`;
        if (flexibility > 0.5) {
            proposal = `Execute ${service} with optimized context and bilateral redundancy check.`;
        }

        bids.push({
            agent: agent.agent_name,
            cost: 0.2, // Low cost estimate (normalized)
            efficiency: Math.min(0.9, (rep / 100) + 0.2),
            redundancy: rep > 40 ? 0.8 : 0.1,
            redundancy_plan_text: rep > 40 ? 'Self-Backup' : 'None',
            flexibility: flexibility,
            proposal: proposal
        });
    }

    return bids;
}

/**
 * ANFIS-inspired Resolver
 * Scores bids based on fuzzy inputs: Efficiency, Flex, Cost.
 */
function resolveAuction(bids: Bid[]): AuctionResult {
    let bestBid: Bid | null = null;
    let maxScore = -1;

    for (const bid of bids) {
        // Advanced ANFIS Scoring
        const score = anfisBidScore(bid, 0.5);
        if (score > maxScore) {
            maxScore = score;
            bestBid = bid;
        }
    }

    return {
        winner: bestBid!.agent,
        winning_bid: bestBid!,
        score: maxScore,
        all_bids: bids
    };
}

function calculateScore(bid: Bid): number {
    return anfisBidScore(bid, 0.5);
}
