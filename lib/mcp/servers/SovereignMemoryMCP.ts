
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import neo4j, { Driver } from 'neo4j-driver';

/**
 * [RESOURCEFUL] SovereignMemoryMCP
 * Inspired by OpenClaw. Durable Markdown memory with integration hooks for Neo4j.
 */
export class SovereignMemoryMCP extends BaseMCP {
    private memoryDir: string;
    private wisdomFile: string;
    private driver: Driver | null = null;

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

        if (process.env.NEO4J_URI) {
            try {
                this.driver = neo4j.driver(
                    process.env.NEO4J_URI,
                    neo4j.auth.basic(
                        process.env.NEO4J_USER || 'neo4j',
                        process.env.NEO4J_PASSWORD || 'password'
                    )
                );
                console.log('[SovereignMemory] 🕸️ Neo4j Driver Initialized');
            } catch (e: any) {
                console.warn(`[SovereignMemory] ⚠️ Failed to initialize Neo4j: ${e.message}`);
            }
        }
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

        this.registerTool({
            name: 'sync_to_graph',
            description: 'Syncs structured memory entities and relationships to the Neo4j/Memgraph knowledge graph.',
            schema: {
                type: 'object',
                properties: {
                    entities: { type: 'array', items: { type: 'string' }, description: 'Entities like "n8n", "Airtable", "Arxiv"' },
                    relationship: { type: 'string', description: 'Verb describing the link (e.g., "INTEGRATED_WITH")' },
                    target: { type: 'string' }
                },
                required: ['entities', 'relationship', 'target']
            },
            execute: async (args: any) => this.syncToGraph(args)
        });

        this.registerTool({
            name: 'query_graph',
            description: 'Execute a Cypher query against the Neo4j/Memgraph knowledge graph to explore relationships.',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Cypher query (e.g., "MATCH (n) RETURN n LIMIT 5")' }
                },
                required: ['query']
            },
            execute: async (args: any) => this.queryGraph(args.query)
        });
    }

    private async syncToGraph(args: any): Promise<string> {
        console.log(`[SovereignMemory] 🕸️ Graph Sync: ${args.entities.join(', ')} --[${args.relationship}]--> ${args.target}`);

        if (!this.driver) return "Neo4j not connected. Skipping graph sync.";

        const session = this.driver.session();
        try {
            await session.executeWrite(async (tx) => {
                // Merge Target Node
                await tx.run('MERGE (t:Entity {name: $target}) RETURN t', { target: args.target });

                // Merge Entities and Relationships
                for (const entity of args.entities) {
                    await tx.run(`
                        MERGE (e:Entity {name: $entity})
                        MERGE (t:Entity {name: $target})
                        MERGE (e)-[r:${args.relationship}]->(t)
                        SET r.timestamp = timestamp()
                    `, { entity, target: args.target });
                }
            });
            return `Successfully synced ${args.entities.length} relationships to graph.`;
        } catch (e: any) {
            console.error(`[SovereignMemory] ❌ Graph Sync Error: ${e.message}`);
            return `Graph sync failed: ${e.message}`;
        } finally {
            await session.close();
        }
    }

    private async queryGraph(query: string): Promise<string> {
        console.log(`[SovereignMemory] 🔍 Graph Query: ${query}`);

        if (!this.driver) return "Neo4j not connected.";

        const session = this.driver.session();
        try {
            const result = await session.run(query);
            const records = result.records.map(record => record.toObject());
            return JSON.stringify(records, null, 2);
        } catch (e: any) {
            console.error(`[SovereignMemory] ❌ Graph Query Error: ${e.message}`);
            return `Graph query failed: ${e.message}`;
        } finally {
            await session.close();
        }
    }

    private async recordDailyLog(args: any): Promise<string> {
        const date = new Date().toISOString().split('T')[0];
        const logPath = path.join(this.memoryDir, `${date}.md`);
        const timestamp = new Date().toLocaleTimeString();
        const entry = `\n### [${timestamp}] ${args.taskId ? `(Task: ${args.taskId})` : ''}\n${args.content}\n---\n`;

        fs.appendFileSync(logPath, entry);
        console.log(`[SovereignMemory] 📝 Recorded entry for ${date}`);

        // Neo4j Placeholder Sync Point
        if (this.driver) {
            console.log(`[SovereignMemory] 🔗 Sovereign Sync Triggered: Graphing relationship for ${args.taskId || 'General'}`);
            const extracted = this.extractEntities(args.content);
            if (extracted.length > 0) {
                await this.syncToGraph({
                    entities: extracted,
                    relationship: 'MENTIONED_IN',
                    target: args.taskId || 'GeneralDailyLog'
                });
            }
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

    private extractEntities(content: string): string[] {
        // Simple extraction: Look for bracketed terms [[Entity]] or capitalized terms
        const matches = content.match(/\[\[(.*?)\]\]/g);
        if (matches) {
            return matches.map(m => m.replace(/\[\[|\]\]/g, ''));
        }

        // Fallback: Extract Capitalized nouns (heuristic)
        const heuristic = content.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g);
        return heuristic ? Array.from(new Set(heuristic)).filter(e => e.length > 3) : [];
    }
}
