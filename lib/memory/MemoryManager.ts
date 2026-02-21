
import { SupabaseClient } from '@supabase/supabase-js';
import {
    VectorStoreIndex,
    storageContextFromDefaults,
    SimpleVectorStore,
    Document,
    MetadataMode,
    RetrieverQueryEngine
} from "llamaindex";
import * as fs from 'fs';
import * as path from 'path';
import { ShimiTree, LLMService } from './ShimiTree';

/**
 * [ANTIGRAVITY] MemoryManager
 * Manages the ST/MT/LT (Short/Medium/Long Term) memory hierarchy.
 * L1: Local Edge (Flash) - SQLite-vec / SimpleStore
 * L2: Swarm P2P (OrbitDB) - Stubbed
 * L3: Deep Archive (IPFS/Supabase) - Stubbed
 */
export class MemoryManager {
    private supabase: SupabaseClient;
    private userId: string;
    private storageDir: string;
    private index: VectorStoreIndex | null = null;

    // Arbitrage Sliders (0.0 to 1.0)
    private arbitrageConfig = {
        speed: 0.8,      // Focus on L1 Local Cache
        efficiency: 0.5, // Balance P2P usage
        truth: 0.7       // BFT Verification intensity
    };

    // SHIMI Silos
    private userTree: ShimiTree;
    private agentTrees: Map<string, ShimiTree> = new Map();
    private llmService: LLMService;

    constructor(supabase: SupabaseClient, userId: string, llmService: LLMService, storageDir?: string) {
        this.supabase = supabase;
        this.userId = userId;
        this.llmService = llmService;
        this.storageDir = storageDir || path.resolve(process.cwd(), 'lib/memory/state', this.userId);

        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        this.userTree = new ShimiTree(this.userId, this.llmService);
    }

    /**
     * Initialize L1 Memory from disk.
     */
    async initialize() {
        try {
            console.log(`[MEMORY] 🧠 Initializing L1 for User: ${this.userId}`);
            const storageContext = await storageContextFromDefaults({
                persistDir: this.storageDir,
            });

            // If the folder is empty, create a new index
            if (fs.readdirSync(this.storageDir).length === 0) {
                this.index = await VectorStoreIndex.fromDocuments([], { storageContext });
            } else {
                this.index = await VectorStoreIndex.init({ storageContext });
            }
        } catch (e) {
            console.warn(`[MEMORY] ⚠️ L1 Init failed, falling back to ephemeral:`, e);
            this.index = await VectorStoreIndex.fromDocuments([]);
        }
    }

    /**
     * Ingest new episodic memory.
     */
    async remember(text: string, metadata: any = {}) {
        if (!this.index) await this.initialize();

        console.log(`[MEMORY] 📝 Ingesting to L1: ${text.substring(0, 50)}...`);
        const doc = new Document({ text, metadata: { ...metadata, userId: this.userId, timestamp: new Date().toISOString() } });
        await this.index!.insertNodes([doc]);

        // 2. SHIMI Silo Ingestion
        if (metadata.agentName) {
            let tree = this.agentTrees.get(metadata.agentName);
            if (!tree) {
                tree = new ShimiTree(this.userId, this.llmService, metadata.agentName);
                this.agentTrees.set(metadata.agentName, tree);
            }
            await tree.addEntity(text, metadata);
        } else {
            await this.userTree.addEntity(text, metadata);
        }

        // Periodic sync to L2/L3...
    }

    /**
     * Retrieve relevant context based on hierarchy.
     */
    async recall(query: string, limit: number = 3): Promise<string> {
        if (!this.index) await this.initialize();

        console.log(`[xMEMORY] 🧠 Recalling context for: ${query.substring(0, 50)}...`);

        // 1. Check L1 (Flash) - Fast vector retrieval
        const retriever = this.index!.asRetriever();
        retriever.similarityTopK = limit;
        const results = await retriever.retrieve(query);

        let context = results.map(r => r.node.getContent(MetadataMode.NONE)).join('\n---\n');

        // 2. SHIMI xMemory Hierarchy (Themes/Semantics/Episodes)
        // This provides hierarchical semantic context that RAG often misses.
        const shimiEntities = await this.userTree.retrieve(query, limit);
        if (shimiEntities.length > 0) {
            context += `\n[xMEMORY HIERARCHICAL CONTEXT]:\n` + shimiEntities.map(e => e.content).join('\n---\n');
        }

        // 3. Fallback to Deep Archive if results are sparse
        if (results.length < limit && this.arbitrageConfig.speed < 0.5) {
            context += await this.recallFromDeep(query);
        }

        return context;
    }

    /**
     * L2 Sync: ST -> MT (OrbitDB Stub)
     */
    private async syncToSwarm(text: string, metadata: any) {
        // [TODO] Implement OrbitDB P2P Push
        // console.log(`[MEMORY] 🔄 Syncing to Swarm (BFT Verification Pending)...`);
    }

    /**
     * L3 Retrieval: Deep History (Supabase/IPFS Fallback)
     */
    private async recallFromDeep(query: string): Promise<string> {
        try {
            const { data, error } = await this.supabase.rpc('match_user_memory', {
                query_embedding: [], // Placeholder for vector embedding call
                match_threshold: 0.7,
                match_count: 2,
                p_user_id: this.userId
            });
            return data?.map((d: any) => d.content).join('\n') || "";
        } catch (e) {
            return "";
        }
    }

    setArbitrage(config: Partial<typeof MemoryManager.prototype.arbitrageConfig>) {
        this.arbitrageConfig = { ...this.arbitrageConfig, ...config };
    }

    /**
     * [ANTIGRAVITY] Location-Aware Prefetching
     * Detects user location (e.g., Commerce, CA) and prefetches regional context.
     */
    async prefetchLocationContext(location: string) {
        console.log(`[MEMORY] 📍 Prefetching location-specific context for: ${location}`);
        // 1. Identify regional themes via SHIMI root
        // 2. Load regional regulation/preference artifacts into L1
    }
}
