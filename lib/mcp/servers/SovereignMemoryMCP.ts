
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * [RESOURCEFUL] SovereignMemoryMCP
 * Inspired by OpenClaw. Durable Markdown memory with integration hooks for Neo4j.
 */
export class SovereignMemoryMCP extends BaseMCP {
    private memoryDir: string;
    private wisdomFile: string;

    constructor() {
        super('SovereignMemory');
        this.memoryDir = path.resolve(process.cwd(), 'memory');
        this.wisdomFile = path.join(this.memoryDir, 'WISDOM.md');

        if (!fs.existsSync(this.memoryDir)) {
            fs.mkdirSync(this.memoryDir, { recursive: true });
        }
        if (!fs.existsSync(this.wisdomFile)) {
            fs.writeFileSync(this.wisdomFile, '# Sovereign Wisdom\nDurable lessons and cross-tool relationships.\n\n');
        }

        this.setupTools();
    }

    async connect(): Promise<void> {
        this.isConnected = true;
    }

    private setupTools() {
        this.registerTool({
            name: 'record_daily_log',
            description: 'Appends raw context and decisions to the daily sovereign log.',
            schema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Log entry content' },
                    taskId: { type: 'string', description: 'Optional task reference' }
                },
                required: ['content']
            },
            execute: async (args: any) => this.recordDailyLog(args)
        });

        this.registerTool({
            name: 'crystallize_wisdom',
            description: 'Extracts a durable lesson or relationship link and saves it to the WISDOM.md file.',
            schema: {
                type: 'object',
                properties: {
                    lesson: { type: 'string', description: 'The crystallized lesson or mapping (e.g., "n8n workflow X links to Airtable table Y")' }
                },
                required: ['lesson']
            },
            execute: async (args: any) => this.crystallizeWisdom(args.lesson)
        });

        this.registerTool({
            name: 'search_sovereign_memory',
            description: 'Search through daily logs and crystallized wisdom for context.',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: ['query']
            },
            execute: async (args: any) => this.searchMemory(args.query)
        });
    }

    private async recordDailyLog(args: any): Promise<string> {
        const date = new Date().toISOString().split('T')[0];
        const logPath = path.join(this.memoryDir, `${date}.md`);
        const timestamp = new Date().toLocaleTimeString();
        const entry = `\n### [${timestamp}] ${args.taskId ? `(Task: ${args.taskId})` : ''}\n${args.content}\n---\n`;

        fs.appendFileSync(logPath, entry);
        console.log(`[SovereignMemory] 📝 Recorded entry for ${date}`);

        // Neo4j Placeholder Sync Point
        if (process.env.NEO4J_URI) {
            console.log(`[SovereignMemory] 🔗 Neo4j Sync Triggered: Graphing relationship for ${args.taskId || 'General'}`);
        }

        return `Log recorded in memory/${date}.md`;
    }

    private async crystallizeWisdom(lesson: string): Promise<string> {
        const entry = `\n- **[${new Date().toISOString().split('T')[0]}]**: ${lesson}`;
        fs.appendFileSync(this.wisdomFile, entry);
        console.log(`[SovereignMemory] 💎 Wisdom crystallized.`);
        return "Wisdom added to Sovereign memory.";
    }

    private async searchMemory(query: string): Promise<string> {
        const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.md'));
        let results = '--- Sovereign Memory Search Results ---\n\n';

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.memoryDir, file), 'utf-8');
            if (content.toLowerCase().includes(query.toLowerCase())) {
                results += `### Matches in ${file}:\n${this.extractSnippet(content, query)}\n\n`;
            }
        }

        return results;
    }

    private extractSnippet(content: string, query: string): string {
        const index = content.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + 200);
        return `...${content.substring(start, end)}...`;
    }
}
