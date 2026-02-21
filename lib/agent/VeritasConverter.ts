/**
 * VeritasConverter: Deterministic Belief Distribution Extraction
 * 
 * Extracts [p_success, p_partial, p_failure] vectors from LLM text output.
 * Priority:
 * 1. Structured XML tags: <belief>[0.95, 0.04, 0.01]</belief>
 * 2. Keyword-based heuristic mapping.
 * 3. Default neutral distribution.
 */

export class VeritasConverter {
    /**
     * Extracts a belief vector from the provided text.
     * @param text The raw LLM response text.
     * @returns A 3-dimensional belief vector [p_success, p_partial, p_failure].
     */
    static extract(text: string): [number, number, number] {
        // 1. Tag Extraction
        const tagRegex = /<belief>\s*\[?\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]?\s*<\/belief>/i;
        const match = text.match(tagRegex);

        if (match) {
            const vector: [number, number, number] = [
                parseFloat(match[1]),
                parseFloat(match[2]),
                parseFloat(match[3])
            ];
            return this.normalize(vector);
        }

        // 2. Keyword Fallback
        return this.heuristicMap(text);
    }

    /**
     * Heuristic mapping based on common certainty markers.
     */
    private static heuristicMap(text: string): [number, number, number] {
        const lower = text.toLowerCase();

        // Success High
        if (lower.includes('verified') || lower.includes('success') || lower.includes('completed successfully')) {
            return [0.90, 0.08, 0.02];
        }

        // Partial/Uncertain
        if (lower.includes('uncertain') || lower.includes('partial') || lower.includes('maybe')) {
            return [0.40, 0.50, 0.10];
        }

        // Failure/Challenged
        if (lower.includes('failed') || lower.includes('error') || lower.includes('challenge')) {
            return [0.05, 0.15, 0.80];
        }

        // Default Neutral (High Uncertainty)
        return [0.33, 0.34, 0.33];
    }

    /**
     * Ensures the vector sums to 1.0.
     */
    private static normalize(vector: [number, number, number]): [number, number, number] {
        const sum = vector[0] + vector[1] + vector[2];
        if (sum === 0) return [0.33, 0.34, 0.33];
        return [
            vector[0] / sum,
            vector[1] / sum,
            vector[2] / sum
        ];
    }
}
