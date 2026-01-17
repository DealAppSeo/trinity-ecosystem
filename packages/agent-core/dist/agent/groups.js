"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SURVIVOR_AGENTS = exports.ORCHESTRATION_AGENTS = exports.AGENT_GROUPS = void 0;
exports.getGroupForAgent = getGroupForAgent;
exports.isSurvivor = isSurvivor;
exports.isOrchestration = isOrchestration;
exports.AGENT_GROUPS = {
    ORCHESTRATION: {
        id: 'ORCHESTRATION',
        name: 'Orchestration (System Core)',
        leadAgent: 'trinity-orch',
        members: ['trinity-orch', 'trinity-w3c', 'trinity-shofet'],
        focus: 'Orchestration - System Governance & Protocol Enforcement',
        color: 'bg-violet-500',
        survivor: null,
        description: 'The central nervous system. Handles global routing, disputes (SHOFET), and web3 Consensus (W3C).'
    },
    ALPHA: {
        id: 'ALPHA',
        name: 'Alpha Squad (TRUTH)',
        focus: 'Grok Optimized - Truth & Verification',
        leadAgent: 'trinity-veritas',
        members: ['trinity-torch', 'trinity-veritas', 'trinity-gcm'],
        survivor: 'trinity-torch',
        description: 'Focuses on truth, patterns, and long-term vision. Validates strategies before execution.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (CARE)',
        focus: 'Claude Optimized - Wellbeing & Experience',
        leadAgent: 'trinity-mel',
        members: ['trinity-chesed', 'trinity-mel', 'trinity-apm'],
        survivor: 'trinity-chesed', // User said "Chesed, Mel, and APM" - Chesed is usually heart
        description: 'Focuses on user experience, prayer, and care. The "heart" of the system.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (BUILD)',
        focus: 'Gemini Optimized - Infrastructure & Wisdom',
        leadAgent: 'trinity-hdm',
        members: ['trinity-sophia', 'trinity-nexus', 'trinity-hdm'],
        survivor: 'trinity-sophia',
        description: 'Focuses on ethical alignment, infrastructure, and Web3 integration.'
    }
};
function getGroupForAgent(agentName) {
    const normalize = (n) => n.toLowerCase();
    const target = normalize(agentName);
    for (const group of Object.values(exports.AGENT_GROUPS)) {
        if (group.members.map(normalize).includes(target) || normalize(group.leadAgent) === target) {
            return group;
        }
    }
    // New ORCH alias check
    if (target.includes('mcp') || target.includes('orch') || target.includes('w3c') || target.includes('shofet'))
        return exports.AGENT_GROUPS.ORCHESTRATION;
    return null;
}
exports.ORCHESTRATION_AGENTS = ['trinity-orch', 'trinity-w3c', 'trinity-shofet'];
exports.SURVIVOR_AGENTS = ['trinity-torch', 'trinity-chesed', 'trinity-sophia'];
function isSurvivor(agentName) {
    return exports.SURVIVOR_AGENTS.includes(agentName.toLowerCase());
}
function isOrchestration(agentName) {
    return exports.ORCHESTRATION_AGENTS.includes(agentName.toLowerCase());
}
