export interface WisdomProvenance {
    source: string;
    url?: string;
    trustScore: number;
    timestamp: string;
}

export interface AgentWisdomResponse {
    agentName: string;
    answer: string;
    confidence: number;
    assumptions: string[];
    unknowns: string[];
    provenance: WisdomProvenance[];
    isMinorityOpinion?: boolean; // Flag for Machloket l'shem shamayim preservation
    metadata?: any;
}

export interface EpistemicFraming {
    confidentClaims: string[];
    reasoning: string;
    uncertainties: string[];
    personalization: string;
}

export interface WisdomSession {
    id: string;
    query: string;
    agentOutputs: Record<string, AgentWisdomResponse>;
    lassoWeights: Record<string, number>;
    dagConnections: Array<{ from: string; to: string; relationship: string }>;
    gnnMatches: any[];
    finalAnswer: string;
    epistemicFraming: EpistemicFraming;
    latencyMs: number;
    createdAt: string;
}
