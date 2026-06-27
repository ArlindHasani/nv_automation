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

export function fixedAnswerCodes(fixedAnswer: string): string[] {
  return fixedAnswer
    .split(/[,+]/)
    .map((code) => code.trim())
    .filter(Boolean);
}

/** Single-code fixed answers get 100 on that code; multi-code fixed answers mark each at 100. */
export function normalizeSplitForFixedAnswer(
  split: Record<string, number>,
  fixedAnswer: string,
): Record<string, number> {
  const fixed = new Set(fixedAnswerCodes(fixedAnswer));
  if (fixed.size === 0) return split;

  const codes = questionAnswerCodes(split);
  if (codes.length === 0) {
    return Object.fromEntries([...fixed].map((code) => [code, 100]));
  }

  const normalized: Record<string, number> = {};
  for (const code of codes) {
    normalized[code] = fixed.has(code) ? 100 : 0;
  }
  return normalized;
}

export function splitMatchesFixedAnswer(
  split: Record<string, number>,
  fixedAnswer: string,
): boolean {
  const fixed = new Set(fixedAnswerCodes(fixedAnswer));
  if (fixed.size === 0) return false;
  const positive = questionAnswerCodes(split).filter(
    (code) => (split[code] ?? 0) > 0,
  );
  if (positive.length !== fixed.size) return false;
  return positive.every((code) => fixed.has(code));
}

export function splitWeightSum(split: Record<string, number>): number {
  return questionAnswerCodes(split).reduce(
    (sum, code) => sum + (split[code] ?? 0),
    0,
  );
}

export function seededUnit(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10000) / 10000;
}

export interface MentionBounds {
  min: number;
  max: number;
  avg: number;
}

export function resolveMentionBounds(question: {
  Min?: number;
  Max?: number;
  AVG?: number | null;
}): MentionBounds | null {
  const min = question.Min ?? 0;
  const max = question.Max ?? 0;
  const avg = question.AVG ?? 0;
  if (min <= 0 || max <= 0 || avg <= 0 || min > max) return null;
  return {
    min,
    max,
    avg: Math.max(min, Math.min(max, avg)),
  };
}

export function hasMentionSplitBounds(question: {
  Type?: string;
  Min?: number;
  Max?: number;
  AVG?: number | null;
}): boolean {
  return question.Type === "Multi" && resolveMentionBounds(question) !== null;
}

/** Sample how many mentions to insert, biased toward avg within [min, max]. */
export function sampleMentionCount(
  bounds: MentionBounds,
  seed?: string,
): number {
  const { min, max, avg } = bounds;
  if (min >= max) return min;

  const options: Array<{ count: number; weight: number }> = [];
  for (let count = min; count <= max; count++) {
    options.push({ count, weight: 1 / (1 + Math.abs(count - avg)) });
  }
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = (seed !== undefined ? seededUnit(`${seed}:count`) : Math.random()) * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.count;
  }
  return Math.max(min, Math.min(max, Math.round(avg)));
}

function pickOneWeightedCode(
  codes: string[],
  split: Record<string, number>,
  seed?: string,
): string {
  const pool = codes
    .map((code) => [code, split[code] ?? 0] as const)
    .filter(([, weight]) => weight > 0);
  if (pool.length === 0) return codes[0] ?? "";

  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return pool[0]![0];

  let roll =
    (seed !== undefined ? seededUnit(seed) : Math.random()) * total;
  for (const [code, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return code;
  }
  return pool[pool.length - 1]![0];
}

/** Pick distinct codes using split weights as relative likelihoods per mention. */
export function pickWeightedDistinctCodes(
  split: Record<string, number>,
  pickCount: number,
  seed?: string,
): string[] {
  const pool = questionAnswerCodes(split).filter((code) => (split[code] ?? 0) > 0);
  if (pool.length === 0 || pickCount <= 0) return [];

  const target = Math.min(pickCount, pool.length);
  const selected: string[] = [];
  let available = [...pool];

  for (let i = 0; i < target; i++) {
    const pick = pickOneWeightedCode(
      available,
      split,
      seed !== undefined ? `${seed}:pick${i}` : undefined,
    );
    selected.push(pick);
    available = available.filter((code) => code !== pick);
  }

  return selected;
}

export function splitUsesIndependentMentions(questionType: string): boolean {
  return questionType === "Multi";
}

/** Single: weights sum to ~100%. Multi: independent mention % per code — total may exceed 100%. */
export function isSplitTotalValid(
  total: number,
  questionType: string,
): boolean {
  if (splitUsesIndependentMentions(questionType)) {
    return total > 0;
  }
  return Math.abs(total - 100) < 0.5;
}

export function summarizeSplitWeights(
  weights: Record<string, number>,
  codes: string[],
  questionType: string,
): { total: number; totalOk: boolean; configured: number } {
  const total =
    Math.round(
      codes.reduce((sum, code) => sum + (weights[code] ?? 0), 0) * 10,
    ) / 10;
  const configured = codes.filter((code) => (weights[code] ?? 0) > 0).length;
  return {
    total,
    totalOk: isSplitTotalValid(total, questionType),
    configured,
  };
}
