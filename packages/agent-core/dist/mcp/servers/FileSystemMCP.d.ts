import { MCPServer, MCPTool } from '../types';
export declare class FileSystemMCP implements MCPServer {
    name: string;
    private rootDir;
    constructor();
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<string>;
    private writeFile;
    private readFile;
    private listFiles;
    private resolveSafePath;
    private generateRepID;
}
