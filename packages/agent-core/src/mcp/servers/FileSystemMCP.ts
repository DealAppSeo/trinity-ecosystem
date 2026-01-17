import { MCPServer, MCPTool } from '../types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabase } from '../../supabase';

export class FileSystemMCP implements MCPServer {
    name = 'FileSystem';
    private rootDir: string;

    constructor() {
        // Safe Root: ./artifacts (create if not exists)
        this.rootDir = path.resolve(process.cwd(), 'artifacts');
        if (!fs.existsSync(this.rootDir)) {
            fs.mkdirSync(this.rootDir, { recursive: true });
        }
    }

    async initialize(): Promise<void> {
        console.log(`[FileSystemMCP] Initialized at ${this.rootDir}`);
    }

    async healthCheck(): Promise<boolean> {
        try {
            fs.accessSync(this.rootDir, fs.constants.W_OK);
            return true;
        } catch (e) {
            return false;
        }
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'write_file',
                description: 'Writes content to a file in the artifacts directory. Arguments: path (string), content (string).',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Relative path (e.g., "report.md")' },
                        content: { type: 'string', description: 'File content' }
                    },
                    required: ['path', 'content']
                },
                execute: async (args: any) => this.writeFile(args.path, args.content)
            },
            {
                name: 'read_file',
                description: 'Reads content from a file in the artifacts directory. Arguments: path (string).',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' }
                    },
                    required: ['path']
                },
                execute: async (args: any) => this.readFile(args.path)
            },
            {
                name: 'list_files',
                description: 'Lists files in the artifacts directory.',
                schema: {
                    type: 'object',
                    properties: {
                        subpath: { type: 'string', description: 'Optional subdirectory' }
                    }
                },
                execute: async (args: any) => this.listFiles(args.subpath)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (toolName === 'write_file') return this.writeFile(args.path, args.content);
        if (toolName === 'read_file') return this.readFile(args.path);
        if (toolName === 'list_files') return this.listFiles(args.subpath);
        throw new Error(`Tool ${toolName} not found`);
    }

    // --- implementations ---

    private async writeFile(relativePath: string, content: string): Promise<string> {
        const safePath = this.resolveSafePath(relativePath);

        // RepID Signing
        const repId = this.generateRepID(content);
        const signedContent = `${content}\n\n<!-- RepID: ${repId} | Signed by Trinity System -->`;

        fs.writeFileSync(safePath, signedContent);

        // PERSISTENCE & ORGANIZATION: Smart Metadata Extraction
        // Path format expected: artifacts/ProjectName/Category/File.md
        const pathParts = relativePath.split('/');
        let project = 'Unassigned';
        let category = 'General';

        // Heuristic: If path starts with namespace, treat it as Project
        // e.g. "NeuroSwarm/Research/report.md" -> Project: NeuroSwarm, Category: Research
        if (pathParts.length > 2) {
            project = pathParts[0];
            category = pathParts[1];
        } else if (pathParts.length === 2) {
            project = pathParts[0];
        }

        // Keywords detection for "Smart Search"
        const keywords = [];
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('patent')) keywords.push('patent');
        if (lowerContent.includes('business plan')) keywords.push('business_plan');
        if (lowerContent.includes('mockup') || lowerContent.includes('ui')) keywords.push('design');
        if (lowerContent.includes('survey')) keywords.push('research');

        try {
            const { error } = await supabase.from('trinity_artifacts').insert({
                file_path: relativePath,
                content: content,
                repid_hash: repId,
                creator_agent: 'Swarm_Agent',
                artifact_type: category.toLowerCase(), // Use folder as type
                metadata: {
                    source: 'FileSystemMCP',
                    signed: true,
                    project: project,
                    category: category,
                    tags: keywords,
                    smart_folder: `${project}/${category}`
                }
            });
            if (error) console.error('[FileSystemMCP] DB Save Error:', error.message);
            else console.log(`[FileSystemMCP] Saved ${relativePath} to Database (Project: ${project}).`);
        } catch (err) {
            console.error('[FileSystemMCP] DB Exception:', err);
        }

        return `Successfully wrote to ${relativePath} (RepID: ${repId})`;
    }

    private async readFile(relativePath: string): Promise<string> {
        const safePath = this.resolveSafePath(relativePath);
        if (!fs.existsSync(safePath)) return "Error: File not found.";
        return fs.readFileSync(safePath, 'utf-8');
    }

    private async listFiles(subpath: string = ''): Promise<string> {
        const targetDir = this.resolveSafePath(subpath);
        if (!fs.existsSync(targetDir)) return "Error: Directory not found.";

        const files = fs.readdirSync(targetDir);
        return JSON.stringify(files);
    }

    private resolveSafePath(relativePath: string): string {
        const resolved = path.resolve(this.rootDir, relativePath);
        if (!resolved.startsWith(this.rootDir)) {
            throw new Error('Access denied: Path traversal attempt.');
        }
        return resolved;
    }

    private generateRepID(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8).toUpperCase();
    }
}
