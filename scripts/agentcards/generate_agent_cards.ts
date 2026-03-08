
import fs from 'fs';
import path from 'path';

const TRINITY_AGENTS = [
    {
        name: 'VERITAS',
        description: 'Drift detection, hallucination prevention, and prediction-gap analysis for autonomous agent transactions. Uses Pythagorean Comma mathematics to detect model divergence before payment execution.'
    },
    {
        name: 'TORCH',
        description: 'Predictive analytics and high-precision financial forecasting on the HyperDAG protocol. Specializes in arbitrage detection and liquidity provisioning.'
    },
    {
        name: 'NEXUS',
        description: 'Multi-agent orchestration and consensus layer for the Trinity Symphony swarm. Manages task distribution and BFT verification.'
    },
    {
        name: 'HDM',
        description: 'HyperDAG Memory (HDM) controller. Manages 4rd-order state transitions and semantic RAG retrieval across the memory hierarchy.'
    },
    {
        name: 'APM',
        description: 'Active Portfolio Manager. Executes risk-managed trades and manages treasury allocations based on swarm consensus.'
    },
    {
        name: 'MEL',
        description: 'Market Efficiency Layer. Analyzes cross-chain protocols for friction and implements optimal routing for agentic swaps.'
    },
    {
        name: 'ANTIGRAV',
        description: 'System-level architect and autonomous development agent. Optimizes codebase, manages deployments, and maintains the ecosystem core.'
    },
    {
        name: 'GCM',
        description: 'Governance & Compliance Manager. Enforces Constitutional Agent guidelines and monitors transaction compliance with the Trinity 1.0 Charter.'
    }
];

const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'agentcards', 'output');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function generateRegistrationFile(agent) {
    return {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: `Trinity-${agent.name}`,
        description: agent.description,
        image: `https://aitrinitysymphony.com/agents/${agent.name}.png`,
        services: [
            {
                name: 'MCP',
                endpoint: `https://aitrinitysymphony.com/mcp/${agent.name}`,
                version: '2025-06-18'
            },
            {
                name: 'A2A',
                endpoint: 'https://aitrinitysymphony.com/.well-known/agent-card.json',
                version: '0.3.0'
            },
            {
                name: 'web',
                endpoint: `https://aitrinitysymphony.com/agents/${agent.name}`
            }
        ],
        x402Support: true,
        active: true,
        registrations: [
            {
                agentId: null, // Will be filled after register()
                agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e'
            }
        ]
    };
}

TRINITY_AGENTS.forEach(agent => {
    const registration = generateRegistrationFile(agent);
    const filePath = path.join(OUTPUT_DIR, `${agent.name.toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(registration, null, 2));
    console.log(`Generated registration for ${agent.name} at ${filePath}`);
});
