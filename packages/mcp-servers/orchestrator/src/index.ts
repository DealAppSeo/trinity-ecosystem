import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ANFISMCPRouter } from '../../../../hyperdag-platform-robust/packages/trinity-web3-bridge/src/mcp/anfis-router.js';
import { ToolIndex } from '../../../../hyperdag-platform-robust/packages/trinity-web3-bridge/src/mcp/tool-index.js';

/**
 * @title Trinity Orchestrator MCP Server
 * @dev Intelligent routing server for the Trinity Symphony ecosystem.
 */

const server = new Server(
    { name: 'trinity-orchestrator', version: '2.0.0' },
    { capabilities: { tools: {} } }
);

const router = new ANFISMCPRouter();
const toolIndex = new ToolIndex();

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'route_task',
                description: 'Intelligently route a task to the most appropriate tools using ANFIS logic.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The task description or query' },
                        userRepID: { type: 'number', description: 'The RepID score of the user' },
                        energyMode: { type: 'string', enum: ['full', 'balanced', 'saver'], default: 'balanced' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'get_agent_status',
                description: 'Get the current status and workload of agents in the swarm.',
                inputSchema: { type: 'object', properties: {} }
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'route_task') {
        const query = (args?.query as string) || '';
        const userRepID = (args?.userRepID as number) || 0;
        const energyMode = (args?.energyMode as any) || 'balanced';

        // Find candidate tools from the index
        const candidates = await toolIndex.search(query, 50);

        // Perform ANFIS selection
        const selected = await router.selectTools(
            { query, userRepID, energyMode },
            candidates.map(c => ({ name: c.toolId, server: c.serverId, costPerCall: 0.01, avgLatencyMs: 500, successRate: 0.95 }))
        );

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    selectedTools: selected,
                    strategy: 'ANFIS + LASSO',
                    optimization: 'Token-Sparse'
                }, null, 2)
            }]
        };
    }

    throw new Error(`Tool not found: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Trinity Orchestrator MCP Server running via stdio');
}

main().catch(console.error);
