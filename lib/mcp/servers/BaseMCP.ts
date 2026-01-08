
import { MCPServer, MCPTool } from '../types';

export abstract class BaseMCP implements MCPServer {
    name: string;
    protected tools: Map<string, MCPTool> = new Map();
    protected isConnected: boolean = false;

    constructor(name: string) {
        this.name = name;
    }

    async initialize(): Promise<void> {
        console.log(`[MCP:${this.name}] Initializing...`);
        try {
            await this.connect();
            this.isConnected = true;
            console.log(`[MCP:${this.name}] ✅ Connected`);
        } catch (error: any) {
            console.error(`[MCP:${this.name}] ❌ Connection Failed: ${error.message}`);
            this.isConnected = false;
            throw error;
        }
    }

    abstract connect(): Promise<void>;

    async getTools(): Promise<MCPTool[]> {
        return Array.from(this.tools.values());
    }

    async callTool(toolName: string, args: any): Promise<string> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found in MCP '${this.name}'`);
        }
        console.log(`[MCP:${this.name}] 🛠️ Executing ${toolName}...`);
        try {
            return await tool.execute(args);
        } catch (error: any) {
            console.error(`[MCP:${this.name}] ❌ Tool Execution Failed: ${error.message}`);
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        return this.isConnected;
    }

    protected registerTool(tool: MCPTool) {
        this.tools.set(tool.name, tool);
    }
}
