export interface MCPTool {
    name: string;
    description: string;
    schema: Record<string, any>;
    execute: (args: any) => Promise<string>;
}
export interface MCPServer {
    name: string;
    initialize(): Promise<void>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<string>;
    healthCheck(): Promise<boolean>;
}
export interface MCPRegistryRecord {
    name: string;
    status: 'connected' | 'disconnected' | 'error';
    tools_count: number;
    last_health_check: string;
}
