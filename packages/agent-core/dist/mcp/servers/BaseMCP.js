"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseMCP = void 0;
class BaseMCP {
    constructor(name) {
        this.tools = new Map();
        this.isConnected = false;
        this.name = name;
    }
    async initialize() {
        console.log(`[MCP:${this.name}] Initializing...`);
        try {
            await this.connect();
            this.isConnected = true;
            console.log(`[MCP:${this.name}] ✅ Connected`);
        }
        catch (error) {
            console.error(`[MCP:${this.name}] ❌ Connection Failed: ${error.message}`);
            this.isConnected = false;
            throw error;
        }
    }
    async getTools() {
        return Array.from(this.tools.values());
    }
    async callTool(toolName, args) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found in MCP '${this.name}'`);
        }
        console.log(`[MCP:${this.name}] 🛠️ Executing ${toolName}...`);
        try {
            return await tool.execute(args);
        }
        catch (error) {
            console.error(`[MCP:${this.name}] ❌ Tool Execution Failed: ${error.message}`);
            throw error;
        }
    }
    async healthCheck() {
        return this.isConnected;
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
}
exports.BaseMCP = BaseMCP;
