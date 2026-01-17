import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';
export declare class SupabaseMCP extends BaseMCP {
    constructor();
    connect(): Promise<void>;
    getTools(): Promise<MCPTool[]>;
    callTool(toolName: string, args: any): Promise<string>;
}
