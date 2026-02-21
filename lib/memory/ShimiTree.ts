import { v4 as uuidv4 } from 'uuid';

export interface LLMService {
    summarize(content: string): Promise<string>;
    getEmbedding(text: string): Promise<number[]>;
}

export enum XMemoryLevel {
    THEME = 0,
    SEMANTIC = 1,
    EPISODE = 2,
    MESSAGE = 3
}

export interface ShimiEntity {
    id: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: string;
    vector?: number[];
}

export interface ShimiNode {
    id: string;
    summary: string;
    entities: ShimiEntity[];
    children: ShimiNode[];
    parentId: string | null;
    level: XMemoryLevel;
    vector?: number[];
}

/**
 * [ANTIGRAVITY] xMemory ShimiTree
 * Implements a 4-level hierarchy: Themes -> Semantics -> Episodes -> Messages.
 * Uses sparsity-aware insertion and top-down hierarchical retrieval.
 */
export class ShimiTree {
    root: ShimiNode;
    userId: string;
    agentId?: string;
    private llmService: LLMService;

    // Hyperparameters
    private branchingFactor: number = 8;
    private similarityThreshold: number = 0.82; // Tightened for xMemory precision
    private uncertaintyThreshold: number = 0.65;

    constructor(userId: string, llmService: LLMService, agentId?: string) {
        this.userId = userId;
        this.agentId = agentId;
        this.llmService = llmService;
        this.root = {
            id: `root-${this.userId}-${this.agentId || 'global'}`,
            summary: "Universal Context Themes",
            entities: [],
            children: [],
            parentId: null,
            level: XMemoryLevel.THEME
        };
    }

    /**
     * xMemory Insertion: Hierarchical descent with sparsity-aware splitting.
     */
    async addEntity(content: string, metadata: any) {
        console.log(`[xMEMORY] 🧬 Ingesting entity into hierarchy: ${content.substring(0, 30)}...`);
        const vector = await this.llmService.getEmbedding(content);

        const entity: ShimiEntity = {
            id: uuidv4(),
            content,
            metadata,
            timestamp: new Date().toISOString(),
            vector
        };

        await this.descendAndInsert(this.root, entity);
    }

    private async descendAndInsert(node: ShimiNode, entity: ShimiEntity) {
        // 1. If we are at the MESSAGE level, attach and return
        if (node.level === XMemoryLevel.MESSAGE) {
            // [LASSO] Sparsity check: Avoid redundant messages in the same episode
            const isRedundant = node.entities.some(e => this.fastSimilarity(entity.vector!, e.vector!) > 0.95);
            if (!isRedundant) {
                node.entities.push(entity);
            }
            return;
        }

        // 2. Find best child for descent
        let bestChild: ShimiNode | null = null;
        let maxSim = -1;

        for (const child of node.children) {
            const sim = await this.calculateSimilarity(entity.vector!, child.vector!);
            if (sim > maxSim) {
                maxSim = sim;
                bestChild = child;
            }
        }

        // 3. Drill down if similarity is high enough
        if (bestChild && maxSim > this.similarityThreshold) {
            await this.descendAndInsert(bestChild, entity);
        }
        // 4. Otherwise, create a new node at the next level if space permits
        else if (node.children.length < this.branchingFactor) {
            const nextLevel = (node.level + 1) as XMemoryLevel;
            const summary = await this.llmService.summarize(entity.content);
            const vector = await this.llmService.getEmbedding(summary);

            const newNode: ShimiNode = {
                id: uuidv4(),
                summary,
                vector,
                entities: nextLevel === XMemoryLevel.MESSAGE ? [entity] : [],
                children: [],
                parentId: node.id,
                level: nextLevel
            };
            node.children.push(newNode);

            // If we just created a level > MESSAGE, we need to push the entity further down
            if (nextLevel < XMemoryLevel.MESSAGE) {
                await this.descendAndInsert(newNode, entity);
            }
        }
        // 5. Fallback: Horizontal spill-over (attach to current level)
        else {
            node.entities.push(entity);
        }
    }

    /**
     * Hierarchical Retrieval: Top-down selection of Themes/Semantics first.
     * Expands to raw Messages only if uncertainty (similarity) is low.
     */
    async retrieve(query: string, limit: number = 5): Promise<ShimiEntity[]> {
        console.log(`[xMEMORY] 🔍 Hierarchical recall for: "${query}"`);
        const queryVector = await this.llmService.getEmbedding(query);
        const results: ShimiEntity[] = [];
        const frontier: ShimiNode[] = [this.root];

        while (frontier.length > 0 && results.length < limit) {
            const node = frontier.shift()!;
            const sim = node.vector ? await this.calculateSimilarity(queryVector, node.vector) : 1.0;

            if (sim > this.uncertaintyThreshold || node.level === XMemoryLevel.THEME) {
                // If it's a high-level node (THEME/SEMANTIC), prioritize children for precision
                if (node.level < XMemoryLevel.EPISODE) {
                    // Sort children by similarity to narrow focus
                    const scoredChildren = await Promise.all(node.children.map(async c => ({
                        node: c,
                        sim: await this.calculateSimilarity(queryVector, c.vector!)
                    })));

                    scoredChildren
                        .sort((a, b) => b.sim - a.sim)
                        .forEach(sc => frontier.push(sc.node));
                }
                // If it's an EPISODE or MESSAGE node, collect entities
                else {
                    results.push(...node.entities.slice(0, limit - results.length));
                }
            }
        }

        return results;
    }

    private async calculateSimilarity(v1: number[], v2: number[]): Promise<number> {
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }
        return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }

    private fastSimilarity(v1: number[], v2: number[]): number {
        let dotProduct = 0;
        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
        }
        return dotProduct; // Assuming normalized vectors for speed
    }
}
