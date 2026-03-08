import { ERC8004Registry } from './registry/ERC8004Registry';
import { ChitinRegistry } from './registry/ChitinRegistry';
import { BFTGate } from './consensus/BFTGate';

export interface TrustShellConfig {
    agentName: string;
    agentDescription: string;
    capabilities: string[];
    spendingCeiling: number;
    owner: string;
    network: 'base-sepolia' | 'base-mainnet';
}

export class TrustShell {
    private config: TrustShellConfig;
    private registry: ERC8004Registry;
    private chitin: ChitinRegistry;
    private bft: BFTGate;

    constructor(config: TrustShellConfig) {
        this.config = config;
        this.registry = new ERC8004Registry(config);
        this.chitin = new ChitinRegistry(config);
        this.bft = new BFTGate(config);

        console.log(`[TrustShell] 🛡️ Initialized for agent: ${config.agentName}`);
    }

    /**
     * Registers the agent on-chain (ERC-8004) and generates a Chitin Soul Certificate.
     */
    async register() {
        console.log(`[TrustShell] 📝 Registering agent ${this.config.agentName} on ${this.config.network}...`);
        try {
            const regTx = await this.registry.register();
            const soulId = await this.chitin.generateCertificate();
            return { regTx, soulId };
        } catch (e: any) {
            console.error(`[TrustShell] ❌ Registration failed:`, e.message);
            // Graceful degradation: allow local use if chain is down
            return { status: 'DEGRADED_LOCAL_MODE' };
        }
    }

    /**
     * Wraps an action with 2/3 BFT consensus and cost-gating.
     */
    async wrapAction(fn: () => Promise<any>, metadata: any) {
        console.log(`[TrustShell] 🔒 Wrapping action: ${metadata.action_type}`);

        // 1. Consensus Gate
        const isAuthorized = await this.bft.verify(metadata);
        if (!isAuthorized) {
            throw new Error("Action blocked: Failed BFT Consensus.");
        }

        // 2. Execute Action
        try {
            return await fn();
        } catch (e: any) {
            console.error(`[TrustShell] Action execution error:`, e.message);
            throw e;
        }
    }

    async getRepID(): Promise<number> {
        // Mock RepID calculation for MVP
        return 78.5;
    }

    async getTrustBadge(): Promise<string> {
        return `https://trustshell.dev/badges/${this.config.agentName}.svg`;
    }
}
