import { MCPServer, MCPTool } from '../types';
export declare class PuppeteerMCP implements MCPServer {
    name: string;
    version: string;
    private browser;
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<any>;
    private getBrowser;
    browsePage(url: string): Promise<string>;
    takeScreenshot(url: string, filename: string): Promise<string>;
}
