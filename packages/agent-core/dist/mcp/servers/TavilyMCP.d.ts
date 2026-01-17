import { MCPServer, MCPTool } from '../types';
export declare class TavilyMCP implements MCPServer {
    name: string;
    private apiKey;
    constructor();
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<string>;
    private search;
}
