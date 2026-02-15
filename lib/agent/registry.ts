
import { AGENT_WISDOM } from './wisdom';

/**
 * Registry of system/legacy entities that should NOT appear in the Swarm Grid.
 */
export const ENTITY_BLACKLIST = [
    'trinity-ecosystem',
    'trinity-science',
    'trinity-symphony',
    'mcp',
    'mcp_server',
    'anfis_demo_bot',
    'health-check'
];

/**
 * Checks if an agent name belongs to the 12 core specialized agents.
 */
export function isCoreAgent(agentName: string): boolean {
    const normalized = agentName.toLowerCase();

    // Check if it's in the wisdom profile (SSOT)
    if (AGENT_WISDOM[normalized] || AGENT_WISDOM[`trinity-${normalized}`]) {
        return true;
    }

    return false;
}

/**
 * Filters a list of agent status records to only include core agents.
 */
export function filterCoreAgents(agents: any[]): any[] {
    return (agents || []).filter(a => {
        const name = (a.agent_name || '').toLowerCase();

        // Explicitly exclude blacklisted entities
        if (ENTITY_BLACKLIST.includes(name)) return false;

        // Must be in wisdom or have trinity- prefix (and not blacklisted)
        return isCoreAgent(name) || name.startsWith('trinity-');
    });
}
