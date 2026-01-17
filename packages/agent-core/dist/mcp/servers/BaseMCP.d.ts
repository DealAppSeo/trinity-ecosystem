import { MCPServer, MCPTool } from '../types';
export declare abstract class BaseMCP implements MCPServer {
    name: string;
    protected tools: Map<string, MCPTool>;
    protected isConnected: boolean;
    constructor(name: string);
    initialize(): Promise<void>;
    abstract connect(): Promise<void>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<string>;
    healthCheck(): Promise<boolean>;
    protected registerTool(tool: MCPTool): void;
}
