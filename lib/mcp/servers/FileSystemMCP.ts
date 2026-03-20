import { MCPServer, MCPTool } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { supabase } from '../../supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export class FileSystemMCP implements MCPServer {
    name = 'FileSystem';
    private rootDir: string;
    private s3: S3Client | null = null;

    constructor() {
        // Safe Root: ./artifacts (create if not exists)
        this.rootDir = path.resolve(process.cwd(), 'artifacts');
        if (!fs.existsSync(this.rootDir)) {
            fs.mkdirSync(this.rootDir, { recursive: true });
        }

        // [PHASE 5] Initialize Cloudflare R2 Client
        if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
            this.s3 = new S3Client({
                region: 'auto',
                endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: process.env.CLOUDFLARE_API_TOKEN_ID || process.env.CLOUDFLARE_API_TOKEN,
                    secretAccessKey: process.env.CLOUDFLARE_API_TOKEN
                }
            });
        }
    }

    private async backupToR2(absolutePath: string, relativeKey: string, payload: string) {
        if (!this.s3) return;
        try {
            const command = new PutObjectCommand({
                Bucket: process.env.CLOUDFLARE_R2_BUCKET,
                Key: `artifacts/${relativeKey}`,
                Body: payload,
                ContentType: relativeKey.endsWith('.json') ? 'application/json' : 'text/plain'
            });
            await this.s3.send(command);
            console.log(`[FileSystemMCP] ☁️ Backed up ${relativeKey} to R2 Bucket.`);
        } catch (e: any) {
            console.warn(`[FileSystemMCP] ⚠️ R2 Backup failed for ${relativeKey}: ${e.message}`);
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
                description: 'Writes content to a file in the artifacts directory. Arguments: path (string), content (string), taskId (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Relative path (e.g., "report.md")' },
                        content: { type: 'string', description: 'File content' },
                        taskId: { type: 'string', description: 'Optional Task ID to link this artifact to' }
                    },
                    required: ['path', 'content']
                },
                execute: async (args: any) => this.writeFile(args.path, args.content, args.taskId)
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
            },
            {
                name: 'find_task_artifact',
                description: 'Recursively searches for an artifact file matching a task ID. Returns path if found.',
                schema: {
                    type: 'object',
                    properties: {
                        taskId: { type: 'string', description: 'The Task ID to search for (e.g. "3718")' }
                    },
                    required: ['taskId']
                },
                execute: async (args: any) => this.findTaskArtifact(args.taskId)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (toolName === 'write_file') return this.writeFile(args.path, args.content);
        if (toolName === 'read_file') return this.readFile(args.path);
        if (toolName === 'list_files') return this.listFiles(args.subpath);
        if (toolName === 'find_task_artifact') return this.findTaskArtifact(args.taskId);
        throw new Error(`Tool ${toolName} not found`);
    }

    // --- implementations ---

    private async writeFile(relativePath: string, content: string, taskId?: string): Promise<string> {
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
            // [ANTIGRAVITY] Link to task if taskId provided
            const dbTaskId = taskId && !isNaN(parseInt(taskId)) ? parseInt(taskId) : null;

            const { error } = await supabase.from('trinity_artifacts').insert({
                task_id: dbTaskId,
                file_path: relativePath,
                content: content,
                repid_hash: repId,
                agent_name: 'Swarm_Agent',
                artifact_type: category.toLowerCase(), // Use folder as type
                metadata: {
                    source: 'FileSystemMCP',
                    signed: true,
                    project: project,
                    category: category,
                }
            });
            if (error) console.error('[FileSystemMCP] DB Save Error:', error.message);
            else console.log(`[FileSystemMCP] Saved ${relativePath} to Database (Project: ${project}).`);

            // [PHASE 5] Cloudflare R2 Backup Sidecar
            if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_R2_BUCKET) {
                this.backupToR2(safePath, relativePath, content).catch(e => console.error('[R2 Backup Error]', e.message));
            }

        } catch (e: any) {
            console.error(`[FileSystemMCP] DB Exception or R2 error for ${relativePath}:`, e.message);
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

    private async findTaskArtifact(taskId: string): Promise<string> {
        console.log(`[FileSystemMCP] 🔍 Searching for artifact: ${taskId}`);
        const found = this.searchDir(this.rootDir, taskId);
        if (found) {
            const rel = path.relative(this.rootDir, found);
            return `Found artifact at: ${rel}`;
        }
        return "Not Found. Try searching other providers or asking for clarification.";
    }

    private searchDir(dir: string, pattern: string): string | null {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const res = this.searchDir(fullPath, pattern);
                if (res) return res;
            } else if (file.toLowerCase().includes(pattern.toLowerCase())) {
                return fullPath;
            }
        }
        return null;
    }
}
