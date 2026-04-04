/**
 * ANFIS LASSO Routing Engine
 *
 * Adaptive Neuro-Fuzzy Inference System with LASSO regularization
 * for optimal LLM provider selection based on cost, latency, quality.
 *
 * Patent: P-015 (Federated Learning Pricing)
 * Rust target: anfis-lasso crate (future)
 */

export interface ProviderScore {
  provider: string;
  model: string;
  costPerToken: number;
  latencyMs: number;
  qualityScore: number;    // 0-1 from historical evaluation
  availabilityScore: number; // 0-1 uptime factor
  tier: 'free' | 'standard' | 'elite';
}

export interface RouteDecision {
  selectedProvider: string;
  selectedModel: string;
  score: number;
  fallbackChain: string[];
  reasoning: string;
}

interface ANFISWeights {
  costWeight: number;
  latencyWeight: number;
  qualityWeight: number;
  availabilityWeight: number;
}

const DEFAULT_WEIGHTS: ANFISWeights = {
  costWeight: 0.25,
  latencyWeight: 0.15,
  qualityWeight: 0.45,
  availabilityWeight: 0.15,
};

/**
 * ANFIS Router — selects optimal LLM provider using fuzzy inference + LASSO.
 *
 * The scoring function is:
 *   score = w_q * quality - w_c * normCost - w_l * normLatency + w_a * availability
 *
 * LASSO regularization prunes low-signal features in the federated learning loop.
 */
export class ANFISRouter {
  private weights: ANFISWeights;
  private providers: ProviderScore[] = [];

  constructor(weights: Partial<ANFISWeights> = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  registerProvider(provider: ProviderScore): void {
    const existing = this.providers.findIndex(
      p => p.provider === provider.provider && p.model === provider.model
    );
    if (existing >= 0) {
      this.providers[existing] = provider;
    } else {
      this.providers.push(provider);
    }
  }

  route(taskType: string, budget: 'free' | 'standard' | 'elite' = 'free'): RouteDecision {
    const eligible = this.providers.filter(p => {
      if (budget === 'free') return p.tier === 'free';
      if (budget === 'standard') return p.tier !== 'elite';
      return true;
    });

    if (eligible.length === 0) {
      return {
        selectedProvider: 'groq',
        selectedModel: 'llama-3.3-70b-versatile',
        score: 0,
        fallbackChain: [],
        reasoning: 'No eligible providers registered; using default',
      };
    }

    // Normalize cost and latency to [0, 1]
    const maxCost = Math.max(...eligible.map(p => p.costPerToken), 0.001);
    const maxLatency = Math.max(...eligible.map(p => p.latencyMs), 1);

    const scored = eligible.map(p => {
      const normCost = p.costPerToken / maxCost;
      const normLatency = p.latencyMs / maxLatency;
      const score =
        this.weights.qualityWeight * p.qualityScore -
        this.weights.costWeight * normCost -
        this.weights.latencyWeight * normLatency +
        this.weights.availabilityWeight * p.availabilityScore;
      return { ...p, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    return {
      selectedProvider: best.provider,
      selectedModel: best.model,
      score: best.score,
      fallbackChain: scored.slice(1, 4).map(p => `${p.provider}/${p.model}`),
      reasoning: `ANFIS selected ${best.provider}/${best.model} (score: ${best.score.toFixed(3)}) for ${taskType} at ${budget} tier`,
    };
  }

  /**
   * Update weights from federated learning aggregation.
   * LASSO: zero out weights below threshold.
   */
  updateWeights(newWeights: Partial<ANFISWeights>, lassoThreshold = 0.05): void {
    const merged = { ...this.weights, ...newWeights };
    // LASSO: prune near-zero weights
    for (const [key, value] of Object.entries(merged)) {
      if (Math.abs(value) < lassoThreshold) {
        (merged as any)[key] = 0;
      }
    }
    this.weights = merged;
  }
}
