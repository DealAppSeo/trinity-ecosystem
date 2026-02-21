/**
 * Haar Wavelet Transform (1D)
 * Used for multiscale decomposition of telemetry signals (entropy, latency, cost).
 */
export class WaveletTransform {
    /**
     * Performs a 1D discrete Haar Wavelet Transform.
     * Returns the coefficients for each scale.
     */
    static transform(signal: number[]): number[][] {
        let current = [...signal];
        const result: number[][] = [];

        // Ensure signal length is a power of 2 for simplicity
        const n = Math.pow(2, Math.floor(Math.log2(current.length)));
        current = current.slice(0, n);

        while (current.length > 1) {
            const next: number[] = [];
            const details: number[] = [];

            for (let i = 0; i < current.length; i += 2) {
                const s = (current[i] + current[i + 1]) / Math.sqrt(2);
                const d = (current[i] - current[i + 1]) / Math.sqrt(2);
                next.push(s);
                details.push(d);
            }

            result.push(details);
            current = next;
        }

        // Push the final approximation (DC component)
        result.push(current);

        return result.reverse(); // Return from coarse to fine scales
    }

    /**
     * Calculates the energy at each scale.
     * Energy is the sum of squares of coefficients at that scale.
     */
    static calculateEnergy(coefficients: number[][]): number[] {
        return coefficients.map(scale => {
            return scale.reduce((acc, val) => acc + (val * val), 0);
        });
    }

    /**
     * Estimates the scaling exponent alpha (slope of log-log energy spectrum).
     * E(k) ~ k^alpha
     */
    static estimateAlpha(energySpectrum: number[]): number {
        const x: number[] = [];
        const y: number[] = [];

        // Skip the approximation scale if it exists (usually the first scale in 1.0.0 order)
        // Energy spectrum is from coarse (index 0) to fine (index n)
        // We use log2 of frequency intervals as X
        for (let i = 1; i < energySpectrum.length; i++) {
            const energy = energySpectrum[i];
            if (energy > 0) {
                x.push(Math.log2(i));
                y.push(Math.log2(energy));
            }
        }

        if (x.length < 2) return 0;

        // Simple linear regression to find slope
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, val, idx) => acc + (val * y[idx]), 0);
        const sumXX = x.reduce((acc, val) => acc + (val * val), 0);
        const n = x.length;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }
}
