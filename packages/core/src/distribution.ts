/** Generate a 5-point split distribution matching a target mean. */
export function generateDistribution(
  targetAvg: number,
  tolerance = 0.01,
  maxAttempts = 1_000_000,
): { distribution: number[]; average: number } {
  for (let i = 0; i < maxAttempts; i++) {
    const weights = Array.from({ length: 5 }, () => Math.random());
    const total = weights.reduce((a, b) => a + b, 0);
    const distribution = weights.map((w) => w / total);
    const average = distribution.reduce(
      (sum, pct, idx) => sum + (idx + 1) * pct,
      0,
    );
    if (Math.abs(average - targetAvg) <= tolerance) {
      return { distribution, average };
    }
  }
  throw new Error(`Could not generate distribution for avg ${targetAvg}`);
}

/** Map distribution to Split object with codes 1-5. */
export function distributionToSplit(
  distribution: number[],
  codeWidth = 0,
): Record<string, number> {
  return Object.fromEntries(
    distribution.map((pct, i) => {
      const code =
        codeWidth > 0
          ? String(i + 1).padStart(codeWidth, "0")
          : String(i + 1);
      return [code, pct];
    }),
  );
}
