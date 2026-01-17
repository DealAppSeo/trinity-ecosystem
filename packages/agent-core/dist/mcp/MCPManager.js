"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpManager = exports.MCPManager = void 0;
const FileSystemMCP_1 = require("./servers/FileSystemMCP");
const PuppeteerMCP_1 = require("./servers/PuppeteerMCP");
const FigmaMCP_1 = require("./servers/FigmaMCP");
const TavilyMCP_1 = require("./servers/TavilyMCP");
const SupabaseMCP_1 = require("./servers/SupabaseMCP");
const AlphaVantageMCP_1 = require("./servers/AlphaVantageMCP");
const GitHubMCP_1 = require("./servers/GitHubMCP");
const GoogleWorkspaceMCP_1 = require("./servers/GoogleWorkspaceMCP");
const PlaywrightMCP_1 = require("./servers/PlaywrightMCP");
class MCPManager {
    constructor() {
        this.servers = new Map();
        // Auto-register built-ins? Or let main app do it. 
        // For simplicity in this fix, let's register it here if we can, or just expect it.
        // Actually, let's just make it available by default for now since it's core.
        this.registerServer(new FileSystemMCP_1.FileSystemMCP());
        this.registerServer(new PuppeteerMCP_1.PuppeteerMCP());
        this.registerServer(new FigmaMCP_1.FigmaMCP());
        this.registerServer(new TavilyMCP_1.TavilyMCP());
        this.registerServer(new SupabaseMCP_1.SupabaseMCP());
        this.registerServer(new AlphaVantageMCP_1.AlphaVantageMCP());
        this.registerServer(new GitHubMCP_1.GitHubMCP());
        this.registerServer(new GoogleWorkspaceMCP_1.GoogleWorkspaceMCP());
        this.registerServer(new PlaywrightMCP_1.PlaywrightMCP());
    }
    registerServer(server) {
        this.servers.set(server.name, server);
        console.log(`[MCPManager] Registered server: ${server.name}`);
    }
    async initializeAll() {
        console.log('[MCPManager] Initializing all servers...');
        for (const [name, server] of this.servers) {
            try {
                await server.initialize();
            }
            catch (error) {
                console.warn(`[MCPManager] Failed to initialize ${name}. It will be unavailable.`);
            }
        }
    }
    async listTools() {
        const allTools = [];
        for (const [name, server] of this.servers) {
            // Check health? For speed, maybe assume health or cache it.
            try {
                const tools = await server.getTools();
                allTools.push(...tools.map(t => ({ ...t, source: name }))); // Tag source
            }
            catch (e) {
                console.warn(`[MCPManager] Failed to list tools for ${name}`);
            }
        }
        return allTools;
    }
    async getToolsForRole(role) {
        const allTools = await this.listTools();
        const roleUpper = role.toUpperCase();
        // Define Role-to-Server Mappings
        const accessMap = {
            'CMO_SQUAD': ['AlphaVantage', 'GoogleWorkspace', 'FileSystem', 'Puppeteer', 'Supabase'],
            'CDO_SQUAD': ['Figma', 'GitHub', 'FileSystem', 'Puppeteer'],
            'CTO_SQUAD': ['GitHub', 'Supabase', 'GoogleWorkspace', 'FileSystem'],
            'ORCHESTRATOR': ['ALL']
        };
        // Determine mapped servers based on role substring
        let allowedServers = [];
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
        }
        else {
            // Default: Give them FileSystem at least? No, safe default is empty.
            // Actually, let's give FileSystem to everyone for now to fix the user issue.
            allowedServers = ['FileSystem'];
        }
        if (allowedServers.includes('ALL'))
            return allTools;
        return allTools.filter(t => t.source && allowedServers.includes(t.source));
    }
    async getToolInstructions(role) {
        const tools = await this.getToolsForRole(role);
        if (tools.length === 0)
            return "You have no external tools assigned to your role.";
        let instruction = `## 🛠️ YOUR TOOLBOX (Role: ${role})\n`;
        instruction += `You have access to the following ${tools.length} external tools. Use them to verify info and execute actions.\n\n`;
        tools.forEach(tool => {
            instruction += `### 🔧 ${tool.name}\n`;
            instruction += `**Description**: ${tool.description}\n`;
            instruction += `**Usage**: \n\`\`\`json\n${JSON.stringify(tool.schema, null, 2)}\n\`\`\`\n\n`;
        });
        return instruction;
    }
    async routeToolCall(toolName, args) {
        // Find which server owns this tool
        for (const server of this.servers.values()) {
            const tools = await server.getTools();
            if (tools.some(t => t.name === toolName)) {
                return await server.callTool(toolName, args);
            }
        }
        throw new Error(`Tool '${toolName}' not found in any active MCP server.`);
    }
    async getStatus() {
        const status = [];
        for (const server of this.servers.values()) {
            let isHealthy = false;
            let toolsCount = 0;
            try {
                isHealthy = await server.healthCheck();
                toolsCount = (await server.getTools()).length;
            }
            catch (e) {
                isHealthy = false;
            }
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
    async discover() {
        const tools = await this.listTools();
        return tools.map(t => t.name);
    }
    async startSession() {
        return {
            id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            startTime: new Date().toISOString()
        };
    }
    async invoke(request) {
        console.log(`[MCP] Invoking ${request.tool} (Session: ${request.sessionId || 'none'})...`);
        return this.routeToolCall(request.tool, request.params || {});
    }
}
exports.MCPManager = MCPManager;
// Singleton Instance
exports.mcpManager = new MCPManager();
