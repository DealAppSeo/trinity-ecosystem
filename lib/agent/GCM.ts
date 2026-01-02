import { ConstitutionalAgent } from './ConstitutionalAgent';

export class GCM extends ConstitutionalAgent {
    constructor() {
        super({ name: 'GCM' });
    }


    // Strategy 9: Targeted Skill Development
    async identifySkillGaps() {
        console.log(`[${this.name}] 🧐 Auditing skill gaps...`);

        // 1. Fetch recent retrospectives from Supabase
        const { data: retros, error } = await this.supabase
            .from('trinity_retros')
            .select('agent, reflection, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !retros || retros.length === 0) {
            console.log(`[${this.name}] No retrospectives found to audit.`);
            return;
        }

        // 2. Analyze using LLM
        const prompt = `
    Analyze these agent retrospectives for learning gaps. 
    Identify 3 specific technical or strategic skills the swarm needs to learn.
    Return JSON format: { "gaps": ["skill 1", "skill 2", "skill 3"], "reasoning": "..." }
    
    Retrospectives:
    ${JSON.stringify(retros)}
    `;

        const analysis = await this.callLLM(prompt);

        let output = analysis.output;

        if (output.includes('Simulation:') || output.includes('Error:')) {
            console.log(`[${this.name}] ⚠️ Using Simulated Gaps (No LLM Key provided)`);
            output = JSON.stringify({
                gaps: ["Recursive Self-Improvement", "Advanced Cryptography"],
                reasoning: "Simulation mode active. Triggering test gaps."
            });
        }

        // 3. Log results (Stub for full knowledge base update)
        console.log(`[${this.name}] Identified Gaps:`, output);

        try {
            // Simple storage of gaps for now
            await this.supabase.from('trinity_research_log').insert({
                gap: output,
                summary: 'GCM Skill Gap Analysis',
                agent: this.name,
                status: 'analysis_complete'
            });
        } catch (e) {
            // Table might not exist yet if skipping steps
            console.warn(`[${this.name}] Could not save gaps to trinity_research_log`);
        }

        // 4. Trigger Research Swarm (Strategy 8)
        try {
            const resultJson = JSON.parse(analysis.output.replace(/```json/g, '').replace(/```/g, ''));
            if (resultJson.gaps && Array.isArray(resultJson.gaps)) {
                console.log(`[${this.name}] 🌩️ Triggering Research Swarm for ${resultJson.gaps.length} gaps...`);

                for (const gap of resultJson.gaps) {
                    // Trigger research task for each gap
                    await this.researchTask(gap);
                }
            }
        } catch (e) {
            console.warn(`[${this.name}] Failed to parse gaps or trigger research`, e);
        }
    }

    /**
     * Strategy 11: Governance Loop (The "Promoter")
     * Scans the registry and promotes/demotes agents based on the law.
     */
    async runGovernanceLoop() {
        console.log(`[${this.name}] ⚖️ Starting Governance Loop...`);

        // 1. Fetch all agents
        const { data: agents, error } = await this.supabase
            .from('trinity_agent_registry')
            .select('*');

        if (error || !agents) {
            console.error(`[${this.name}] Failed to fetch agent registry`, error);
            return;
        }

        // 2. Audit each agent
        for (const agent of agents) {
            const score = agent.reputation_score;
            let correctTier = agent.current_tier;

            // Define the Law of Promotion
            if (score <= 40) correctTier = 'Assist';
            else if (score <= 70) correctTier = 'Approve';
            else if (score <= 90) correctTier = 'Act';
            else correctTier = 'Learn';

            // 3. Enforce the Law
            if (correctTier !== agent.current_tier) {
                console.log(`[${this.name}] 🚨 PROMOTION/DEMOTION: ${agent.agent_name} (${agent.current_tier} -> ${correctTier})`);

                await this.supabase
                    .from('trinity_agent_registry')
                    .update({ current_tier: correctTier })
                    .eq('agent_name', agent.agent_name);

                // Tip: In a real system, we would notify the user here
            } else {
                console.log(`[${this.name}] ✅ ${agent.agent_name} is compliant (Tier: ${correctTier}, Score: ${score})`);
            }
        }
    }
}

