import { MCPServer, MCPTool, MCPRegistryRecord } from './types';
import { FileSystemMCP } from './servers/FileSystemMCP';
import { PuppeteerMCP } from './servers/PuppeteerMCP';
import { FigmaMCP } from './servers/FigmaMCP';
import { TavilyMCP } from './servers/TavilyMCP';
import { SupabaseMCP } from './servers/SupabaseMCP';
import { AlphaVantageMCP } from './servers/AlphaVantageMCP';
import { GitHubMCP } from './servers/GitHubMCP';
import { GoogleWorkspaceMCP } from './servers/GoogleWorkspaceMCP';
import { PlaywrightMCP } from './servers/PlaywrightMCP';

export class MCPManager {
    private servers: Map<string, MCPServer> = new Map();

    constructor() {
        // Auto-register built-ins? Or let main app do it. 
        // For simplicity in this fix, let's register it here if we can, or just expect it.
        // Actually, let's just make it available by default for now since it's core.
        this.registerServer(new FileSystemMCP());
        this.registerServer(new PuppeteerMCP());
        this.registerServer(new FigmaMCP());
        this.registerServer(new TavilyMCP());
        this.registerServer(new SupabaseMCP());
        this.registerServer(new AlphaVantageMCP());
        this.registerServer(new GitHubMCP());
        this.registerServer(new GoogleWorkspaceMCP());
        this.registerServer(new PlaywrightMCP());
    }

    registerServer(server: MCPServer) {
        this.servers.set(server.name, server);
        console.log(`[MCPManager] Registered server: ${server.name}`);
    }

    async initializeAll() {
        console.log('[MCPManager] Initializing all servers...');
        for (const [name, server] of this.servers) {
            try {
                await server.initialize();
            } catch (error) {
                console.warn(`[MCPManager] Failed to initialize ${name}. It will be unavailable.`);
            }
        }
    }

    async listTools(): Promise<MCPTool[]> {
        const allTools: MCPTool[] = [];
        for (const [name, server] of this.servers) {
            // Check health? For speed, maybe assume health or cache it.
            try {
                const tools = await server.getTools();
                allTools.push(...tools.map(t => ({ ...t, source: name }))); // Tag source
            } catch (e) {
                console.warn(`[MCPManager] Failed to list tools for ${name}`);
            }
        }
        return allTools;
    }

    async getToolsForRole(role: string): Promise<MCPTool[]> {
        const allTools = await this.listTools();
        const roleUpper = role.toUpperCase();

        // Define Role-to-Server Mappings
        const accessMap: Record<string, string[]> = {
            'CMO_SQUAD': ['AlphaVantage', 'GoogleWorkspace', 'FileSystem', 'Puppeteer', 'Supabase'],
            'CDO_SQUAD': ['Figma', 'GitHub', 'FileSystem', 'Puppeteer'],
            'CTO_SQUAD': ['GitHub', 'Supabase', 'GoogleWorkspace', 'FileSystem'],
            'ORCHESTRATOR': ['ALL']
        };

        // Determine mapped servers based on role substring
        let allowedServers: string[] = [];

        // ALPHA SQUAD (Marketing/Truth) - Grok
        if (roleUpper.includes('CMO') || roleUpper.includes('GROK') || roleUpper.includes('MARKETING') || roleUpper.includes('VERITAS') || roleUpper.includes('W3C')) {
            allowedServers = ['TavilySearch', ...accessMap['CMO_SQUAD']];
        }
        // BETA SQUAD (Design/Care) - Claude
        else if (roleUpper.includes('CDO') || roleUpper.includes('CLAUDE') || roleUpper.includes('DESIGN') || roleUpper.includes('MEL') || roleUpper.includes('LILY')) {
            allowedServers = accessMap['CDO_SQUAD'];
        }
        // GAMMA SQUAD (Build/Infra) - Gemini
        else if (roleUpper.includes('CTO') || roleUpper.includes('GEMINI') || roleUpper.includes('GABRIEL') || roleUpper.includes('HDM') || roleUpper.includes('TORCH')) {
            allowedServers = accessMap['CTO_SQUAD'];
        }
        // ORCHESTRATION
        else if (roleUpper.includes('ORCHESTRATOR') || roleUpper.includes('MANAGER')) {
            allowedServers = ['ALL'];
        } else {
            // Default: Give them FileSystem at least? No, safe default is empty.
            // Actually, let's give FileSystem to everyone for now to fix the user issue.
            allowedServers = ['FileSystem'];
        }

        if (allowedServers.includes('ALL')) return allTools;

        return allTools.filter(t => (t as any).source && allowedServers.includes((t as any).source));
    }

    async getToolInstructions(role: string): Promise<string> {
        const tools = await this.getToolsForRole(role);
        if (tools.length === 0) return "You have no external tools assigned to your role.";

        let instruction = `## 🛠️ YOUR TOOLBOX (Role: ${role})\n`;
        instruction += `You have access to the following ${tools.length} external tools. Use them to verify info and execute actions.\n\n`;

        tools.forEach(tool => {
            instruction += `### 🔧 ${tool.name}\n`;
            instruction += `**Description**: ${tool.description}\n`;
            instruction += `**Usage**: \n\`\`\`json\n${JSON.stringify(tool.schema, null, 2)}\n\`\`\`\n\n`;
        });

        return instruction;
    }

    async routeToolCall(toolName: string, args: any): Promise<string> {
        // Find which server owns this tool
        for (const server of this.servers.values()) {
            const tools = await server.getTools();
            if (tools.some(t => t.name === toolName)) {
                return await server.callTool(toolName, args);
            }
        }
        throw new Error(`Tool '${toolName}' not found in any active MCP server.`);
    }

    async getStatus(): Promise<MCPRegistryRecord[]> {
        const status: MCPRegistryRecord[] = [];
        for (const server of this.servers.values()) {
            let isHealthy = false;
            let toolsCount = 0;
            try {
                isHealthy = await server.healthCheck();
                toolsCount = (await server.getTools()).length;
            } catch (e) { isHealthy = false; }

            status.push({
                name: server.name,
                status: isHealthy ? 'connected' : 'error',
                tools_count: toolsCount,
                last_health_check: new Date().toISOString()
            });
        }
        return status;
    }
    // ==========================================
    // ANTHROPIC MCP PROTOCOL COMPATIBILITY LAYER
    // ==========================================

    async discover(): Promise<string[]> {
        const tools = await this.listTools();
        return tools.map(t => t.name);
    }

    async startSession(): Promise<{ id: string, startTime: string }> {
        return {
            id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            startTime: new Date().toISOString()
        };
    }

    async invoke(request: { tool: string; params?: any; sessionId?: string }): Promise<any> {
        console.log(`[MCP] Invoking ${request.tool} (Session: ${request.sessionId || 'none'})...`);
        return this.routeToolCall(request.tool, request.params || {});
    }
}

// Singleton Instance
export const mcpManager = new MCPManager();
