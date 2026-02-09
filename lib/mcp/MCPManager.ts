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
import { PlaywrightExpertMCP } from './servers/PlaywrightExpertMCP';
import { CreativeMCP } from './servers/CreativeMCP';
import { ComposioMCP } from './servers/ComposioMCP';
import { StitchMCP } from './servers/StitchMCP';
import { SandboxMCP } from './servers/SandboxMCP';
import { FrameworksMCP } from './servers/FrameworksMCP';
import { AutomationMCP } from './servers/AutomationMCP';
import { KnowledgeMCP } from './servers/KnowledgeMCP';
import { DataMCP } from './servers/DataMCP';
import { RedisMCP } from './servers/RedisMCP';
import { HuggingFaceMCP } from './servers/HuggingFaceMCP';
import { RailwayMCP } from './servers/RailwayMCP';
import { YouDotComMCP } from './servers/YouDotComMCP';
import { EfficiencyMCP } from './servers/EfficiencyMCP';
import { N8NMCP } from './servers/N8NMCP';
import { GuardrailsMCP } from './servers/GuardrailsMCP';
import { SovereignMemoryMCP } from './servers/SovereignMemoryMCP';
import { CohereMCP } from './servers/CohereMCP';
import { ASICloudMCP } from './servers/ASICloudMCP';
import { ReplicateMCP } from './servers/ReplicateMCP';
import { ResearchMCP } from './servers/ResearchMCP';
import { E2BMCP } from './servers/E2BMCP';
import { HumanMCP } from './servers/HumanMCP';
import { NotionMCP } from './servers/NotionMCP';
import { BraveMCP } from './servers/BraveMCP';

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
        this.registerServer(new PlaywrightExpertMCP());
        this.registerServer(new CreativeMCP());
        this.registerServer(new EfficiencyMCP());
        this.registerServer(new N8NMCP());
        this.registerServer(new GuardrailsMCP());
        this.registerServer(new SovereignMemoryMCP());
        this.registerServer(new ComposioMCP());
        this.registerServer(new StitchMCP());
        this.registerServer(new SandboxMCP());
        this.registerServer(new FrameworksMCP());
        this.registerServer(new AutomationMCP());
        this.registerServer(new KnowledgeMCP());
        this.registerServer(new DataMCP());
        this.registerServer(new RedisMCP());
        this.registerServer(new HuggingFaceMCP());
        this.registerServer(new RailwayMCP());
        this.registerServer(new YouDotComMCP());
        this.registerServer(new CohereMCP());
        this.registerServer(new ASICloudMCP());
        this.registerServer(new ReplicateMCP());
        this.registerServer(new ResearchMCP());
        this.registerServer(new E2BMCP());
        this.registerServer(new HumanMCP());
        this.registerServer(new NotionMCP());
        this.registerServer(new BraveMCP());
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

        // Define Role-to-Server Mappings (Hardened for Redundancy)
        const accessMap: Record<string, string[]> = {
            'ALPHA_SQUAD': ['TavilySearch', 'BraveSearch', 'AlphaVantage', 'GoogleWorkspace', 'FileSystem', 'Playwright', 'Supabase', 'PlaywrightExpert', 'YouDotCom', 'Cohere', 'Replicate', 'ResearchSuite', 'CloudSandbox', 'HumanPilot', 'Notion'],
            'BETA_SQUAD': ['Figma', 'GitHub', 'FileSystem', 'Playwright', 'Composio', 'stitch', 'CreativeSuite', 'PlaywrightExpert', 'HuggingFace', 'TavilySearch', 'BraveSearch', 'YouDotCom', 'Replicate', 'ResearchSuite', 'CloudSandbox', 'HumanPilot'],
            'GAMMA_SQUAD': ['GitHub', 'Supabase', 'GoogleWorkspace', 'FileSystem', 'Composio', 'stitch', 'PlaywrightExpert', 'Redis', 'Railway', 'Cohere', 'ASICloud', 'TavilySearch', 'BraveSearch', 'Playwright', 'YouDotCom', 'Replicate', 'ResearchSuite', 'CloudSandbox', 'HumanPilot'],
            'ORCHESTRATION': ['ALL']
        };

        // Determine mapped servers based on role substring
        let allowedServers: string[] = [];

        // Match by literal squad name or specific agent name from Railway
        // ALPHA SQUAD (Truth/Strategy): Torch, Veritas, GCM
        if (roleUpper.includes('ALPHA') || roleUpper.includes('TORCH') || roleUpper.includes('VERITAS') || roleUpper.includes('GCM')) {
            allowedServers = accessMap['ALPHA_SQUAD'];
        }
        // BETA SQUAD (Design/Creative): Chesed, Mel, APM
        else if (roleUpper.includes('BETA') || roleUpper.includes('CHESED') || roleUpper.includes('MEL') || roleUpper.includes('APM')) {
            allowedServers = accessMap['BETA_SQUAD'];
        }
        // GAMMA SQUAD (Build/Infra): Sophia, Nexus, HDM
        else if (roleUpper.includes('GAMMA') || roleUpper.includes('SOPHIA') || roleUpper.includes('NEXUS') || roleUpper.includes('HDM')) {
            allowedServers = accessMap['GAMMA_SQUAD'];
        }
        // ORCHESTRATION: Orch, W3C, Shofet
        else if (roleUpper.includes('ORCH') || roleUpper.includes('W3C') || roleUpper.includes('SHOFET') || roleUpper.includes('MANAGER')) {
            allowedServers = accessMap['ORCHESTRATION'];
        } else {
            allowedServers = ['FileSystem'];
        }

        if (allowedServers.includes('ALL')) return allTools;

        return allTools.filter(t => (t as any).source && allowedServers.includes((t as any).source));
    }

    async getToolInstructions(role: string): Promise<string> {
        const tools = await this.getToolsForRole(role);
        const roleUpper = role.toUpperCase();
        if (tools.length === 0) return "You have no external tools assigned to your role.";

        let instruction = `## 🛠️ YOUR TOOLBOX (Role: ${role})\n`;
        instruction += `You have access to the following ${tools.length} external tools. Use them to verify info and execute actions.\n\n`;

        tools.forEach(tool => {
            instruction += `### 🔧 ${tool.name}\n`;
            instruction += `**Description**: ${tool.description}\n`;
            instruction += `**Usage**: \n\`\`\`json\n${JSON.stringify(tool.schema, null, 2)}\n\`\`\`\n\n`;
        });

        // [ANTIGRAVITY] SQUAD-SPECIFIC VISUAL TRUST ENFORCEMENT
        if (roleUpper.includes('GAMMA') || roleUpper.includes('HDM')) {
            instruction += `\n> [!IMPORTANT]\n> **GAMMA SQUAD REQUIREMENT**: You MUST provide a Mermaid diagram for all architecture, logic, or code structure tasks to ensure Visual Trust during BFT review.\n`;
        }

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
