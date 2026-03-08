import { WisdomEngine } from '../lib/wisdom/WisdomEngine';

async function main() {
    console.log("🚀 Testing Wisdom Engine Council v8.2...");

    const engine = new WisdomEngine();
    const query = "Should Trinity Symphony prioritize Base Sepolia or Recall Network for its primary semantic memory layer?";

    console.log(`\n📝 Query: ${query}`);

    try {
        const session = await engine.processQuery(query, { origin: 'test-runner' });

        console.log("\n✅ Wisdom Results:");
        console.log(`Final Answer Summary: ${session.finalAnswer.substring(0, 100)}...`);
        console.log(`Council Confidence: ${Object.values(session.agentOutputs).reduce((a, b) => a + b.confidence, 0) / 10} `);

        console.log("\n📊 Agent Highlights:");
        Object.values(session.agentOutputs).forEach(out => {
            console.log(`- [${out.agentName}] Conf: ${out.confidence.toFixed(2)} ${out.isMinorityOpinion ? '(MINORITY)' : ''}`);
        });

        console.log("\n⚖️ Arbitration Check:");
        if (session.epistemicFraming.reasoning.includes('Arbitration')) {
            console.log("✅ SHOFET Arbitration triggered correctly.");
        } else {
            console.log("ℹ️ No arbitration needed for this run.");
        }

        console.log("\n🔗 DAG Connections:");
        session.dagConnections.forEach(conn => {
            console.log(`- ${conn.from} --(${conn.relationship})--> ${conn.to}`);
        });

        console.log(`\n⚡ Total Latency: ${session.latencyMs}ms`);

    } catch (error) {
        console.error("❌ Wisdom Engine Execution Failed:", error);
    }
}

main().catch(console.error);
