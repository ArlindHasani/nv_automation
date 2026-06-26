/** Helpers for Split method weights on Definition questions. */

export function questionAnswerCodes(
  split: Record<string, number>,
): string[] {
  return Object.keys(split).filter((k) => k !== "");
}

export function hasPositiveSplitWeights(split: Record<string, number>): boolean {
  return questionAnswerCodes(split).some((code) => (split[code] ?? 0) > 0);
}

/** Equal percentage weights (sum ≈ 100) for Split method UI. */
export function equalSplitWeights(codes: string[]): Record<string, number> {
  if (codes.length === 0) return { "": 0 };
  const each = Math.round((100 / codes.length) * 100) / 100;
  const weights = Object.fromEntries(codes.map((c) => [c, each]));
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const last = codes[codes.length - 1];
  if (last) {
    weights[last] = Math.round((weights[last] + (100 - sum)) * 100) / 100;
  }
  return weights;
}

export function mergeSplitWeights(
  existing: Record<string, number>,
  incoming: Record<string, number>,
): Record<string, number> {
  const merged = { ...existing };
  for (const [code, weight] of Object.entries(incoming)) {
    if (code === "") continue;
    merged[code] = weight;
  }
  return merged;
}

export function splitWeightSum(split: Record<string, number>): number {
  return questionAnswerCodes(split).reduce(
    (sum, code) => sum + (split[code] ?? 0),
    0,
  );
}
