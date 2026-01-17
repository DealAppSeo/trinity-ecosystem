import { MCPServer, MCPTool, MCPRegistryRecord } from './types';
export declare class MCPManager {
    private servers;
    constructor();
    registerServer(server: MCPServer): void;
    initializeAll(): Promise<void>;
    listTools(): Promise<MCPTool[]>;
    getToolsForRole(role: string): Promise<MCPTool[]>;
    getToolInstructions(role: string): Promise<string>;
    routeToolCall(toolName: string, args: any): Promise<string>;
    getStatus(): Promise<MCPRegistryRecord[]>;
    discover(): Promise<string[]>;
    startSession(): Promise<{
        id: string;
        startTime: string;
    }>;
    invoke(request: {
        tool: string;
        params?: any;
        sessionId?: string;
    }): Promise<any>;
}
export declare const mcpManager: MCPManager;
