import { ConstitutionalAgent } from './ConstitutionalAgent';
export declare class GCM extends ConstitutionalAgent {
    constructor();
    identifySkillGaps(): Promise<void>;
    /**
     * Strategy 11: Governance Loop (The "Promoter")
     * Scans the registry and promotes/demotes agents based on the law.
     */
    runGovernanceLoop(): Promise<void>;
}
