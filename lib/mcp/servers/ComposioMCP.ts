import { BaseMCP } from './BaseMCP';
import { Composio } from "composio-core";

/**
 * ComposioMCP Server
 * Provides access to 100+ tools through the Composio SDK.
 * Integrated into the Trinity mcpManager for role-based access.
 */
export class ComposioMCP extends BaseMCP {
    private composio: any;
    private apiKey: string;

    constructor() {
        super('Composio');
        this.apiKey = process.env.COMPOSIO_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[ComposioMCP] ⚠️ COMPOSIO_API_KEY is missing. Operating in discovery mode.');
            this.registerTool({
                name: 'composio_info',
                description: 'Returns information about the Composio integration status.',
                schema: { type: 'object', properties: {} },
                execute: async () => 'Composio integration is active but requires COMPOSIO_API_KEY for action execution.'
            });
            return;
        }

        try {
            // Initialize Composio
            this.composio = new Composio({ apiKey: this.apiKey });

            // Register the primary execution tool
            this.registerTool({
                name: 'composio_execute',
                description: 'Execute a vetted action via Composio. Supported apps: github, vercel, figma, slack, google-calendar, etc.',
                schema: {
                    type: 'object',
                    properties: {
                        app: { type: 'string', description: 'The app name (e.g., github, vercel)' },
                        action: { type: 'string', description: 'The specific action name (e.g., github_create_issue)' },
                        params: { type: 'object', description: 'Action parameters' }
                    },
                    required: ['app', 'action']
                },
                execute: async (args: any) => {
                    console.log(`[Composio] 🚀 Requesting ${args.action} via ${args.app}...`);
                    try {
                        const result = await this.composio.executeAction(args.action, args.params || {});
                        return JSON.stringify(result, null, 2);
                    } catch (e: any) {
                        console.error(`[Composio] ❌ Execution failed: ${e.message}`);
                        return `Composio Error: ${e.message}`;
                    }
                }
            });

            // Discovery tool to help agents find actions
            this.registerTool({
                name: 'composio_list_actions',
                description: 'List available actions for a specific app on Composio.',
                schema: {
                    type: 'object',
                    properties: {
                        app: { type: 'string', description: 'App to filter (e.g., figma)' }
                    },
                    required: ['app']
                },
                execute: async (args: any) => {
                    console.log(`[Composio] 🔍 Searching actions for ${args.app}...`);
                    try {
                        const actions = await this.composio.getActions({ apps: [args.app] });
                        return JSON.stringify(actions.map((a: any) => ({ name: a.name, description: a.description })), null, 2);
                    } catch (e: any) {
                        return `Error listing actions: ${e.message}`;
                    }
                }
            });

            // Authentication tool to allow agents to request connections
            this.registerTool({
                name: 'composio_connect_app',
                description: 'Get an OAuth connection link for a specific app. If an agent tries to use GitHub but it is not linked, use this to get the link for the user.',
                schema: {
                    type: 'object',
                    properties: {
                        app: { type: 'string', description: 'App to connect (e.g., github, slack, linear, figma)' }
                    },
                    required: ['app']
                },
                execute: async (args: any) => {
                    console.log(`[Composio] 🔗 Generating connection link for ${args.app}...`);
                    try {
                        const entity = await this.composio.getEntity("default");
                        const connection = await entity.initiateConnection(args.app);
                        return `Connection Link for ${args.app}: ${connection.redirectUrl}\n\nIMPORTANT: Please click this link to authorize the agent. Once done, let the agent know.`;
                    } catch (e: any) {
                        return `Error initiating connection: ${e.message}`;
                    }
                }
            });

            this.isConnected = true;
        } catch (e: any) {
            console.error(`[ComposioMCP] ❌ Handshake failed: ${e.message}`);
            this.isConnected = false;
        }
    }
}
