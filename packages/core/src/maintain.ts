import {
  collectMentionCodesFromRow,
  formatCodeForQuestion,
  getDataValue,
  getOtherTextColumnForQuestion,
  getValueColumnForQuestion,
} from "./mapping.js";
import {
  hasMentionSplitBounds,
  pickWeightedDistinctCodes,
  questionAnswerCodes,
  resolveMentionBounds,
  sampleMentionCount,
  seededUnit,
} from "./split.js";
import type { DataRow, Definition, Question } from "./schemas.js";

export interface ResolvedAnswer {
  codes: string[];
  openText?: string;
  /** Per-row answers on NV table grid screens (QUESTLIST). */
  statementAnswers?: Record<string, string[]>;
  source: "data" | "fallback" | "split";
  warnings: string[];
}

export interface MaintainOptions {
  /** Default code when value missing (matches Cloner PRVCY → 1 behavior). */
  missingFallback?: string;
  /** Treat numeric 0 as valid answer. */
  allowZero?: boolean;
}

function isPresent(value: unknown, allowZero: boolean): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (!allowZero && value === 0) return false;
  return true;
}

function resolveMaintainSingle(
  question: Question,
  row: DataRow,
  columns: string[],
  options: MaintainOptions,
): ResolvedAnswer {
  const warnings: string[] = [];
  const col =
    getValueColumnForQuestion(question.Name, columns) ??
    question.Name.toLowerCase();
  const raw = getDataValue(row, col);

  if (!isPresent(raw, options.allowZero ?? true)) {
    const fallback = options.missingFallback ?? "1";
    warnings.push(`Value for question '${question.Name}' not found in data.`);
    return {
      codes: [formatCodeForQuestion(question, fallback)],
      source: "fallback",
      warnings,
    };
  }

  return {
    codes: [formatCodeForQuestion(question, raw as string | number)],
    source: "data",
    warnings,
  };
}

function resolveMaintainMulti(
  question: Question,
  row: DataRow,
  columns: string[],
  options: MaintainOptions,
): ResolvedAnswer {
  const warnings: string[] = [];
  const codes = collectMentionCodesFromRow(
    question.Name,
    row,
    columns,
    question,
  );

  if (codes.length === 0) {
    const fallback = options.missingFallback;
    if (fallback) {
      warnings.push(`No multi values for '${question.Name}' in data.`);
      return {
        codes: [formatCodeForQuestion(question, fallback)],
        source: "fallback",
        warnings,
      };
    }
    warnings.push(`No multi values for '${question.Name}' in data.`);
  }

  return { codes, source: codes.length ? "data" : "fallback", warnings };
}

function resolveMaintainOpen(
  question: Question,
  row: DataRow,
  columns: string[],
): ResolvedAnswer {
  const warnings: string[] = [];
  const col =
    getOtherTextColumnForQuestion(question.Name, columns) ??
    `o_${question.Name.toLowerCase()}`;
  const raw = getDataValue(row, col);

  if (typeof raw === "string" && raw.length > 0) {
    return { codes: [], openText: raw, source: "data", warnings };
  }

  warnings.push(`Open text for '${question.Name}' not found in data.`);
  return { codes: [], openText: "", source: "fallback", warnings };
}

/** Pick a code from Split weights; optional seed makes explore passes reproducible. */
export function resolveSplit(
  question: Question,
  seed?: string,
): ResolvedAnswer {
  if (question.Type === "Multi") {
    return resolveSplitMulti(question, seed);
  }

  const entries = Object.entries(question.Split).filter(
    ([, weight]) => weight > 0,
  );
  if (entries.length === 0) {
    const codes = Object.keys(question.Split).filter((k) => k !== "");
    if (codes.length === 0) {
      return {
        codes: [],
        source: "fallback",
        warnings: [`No split weights for '${question.Name}'.`],
      };
    }
    const pick =
      seed !== undefined
        ? codes[Math.floor(seededUnit(seed) * codes.length)] ?? codes[0]
        : codes[Math.floor(Math.random() * codes.length)] ?? codes[0];
    return { codes: [pick!], source: "split", warnings: [] };
  }

  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = (seed !== undefined ? seededUnit(seed) : Math.random()) * total;
  for (const [code, weight] of entries) {
    r -= weight;
    if (r <= 0) {
      return { codes: [code], source: "split", warnings: [] };
    }
  }

  return { codes: [entries[0]![0]], source: "split", warnings: [] };
}

/**
 * Mention-style multi: sample a mention count within min/max (avg ~ AVG), then pick
 * that many distinct codes using split weights as relative likelihoods.
 */
function resolveSplitMulti(
  question: Question,
  seed?: string,
): ResolvedAnswer {
  const codes = questionAnswerCodes(question.Split);
  if (codes.length === 0) {
    return {
      codes: [],
      source: "fallback",
      warnings: [`No split weights for '${question.Name}'.`],
    };
  }

  const bounds = resolveMentionBounds(question);
  if (hasMentionSplitBounds(question) && bounds) {
    const mentionCount = sampleMentionCount(bounds, seed);
    const rawCodes = pickWeightedDistinctCodes(
      question.Split,
      mentionCount,
      seed,
    );
    return {
      codes: rawCodes.map((code) => formatCodeForQuestion(question, code)),
      source: "split",
      warnings: [],
    };
  }

  const selected: string[] = [];
  for (const code of codes) {
    const weight = question.Split[code] ?? 0;
    if (weight <= 0) continue;
    const threshold = weight / 100;
    const roll =
      seed !== undefined ? seededUnit(`${seed}:${code}`) : Math.random();
    if (roll < threshold) {
      selected.push(formatCodeForQuestion(question, code));
    }
  }

  return { codes: selected, source: "split", warnings: [] };
}

export function resolveAnswer(
  question: Question,
  row: DataRow,
  options: MaintainOptions = {},
): ResolvedAnswer {
  if (question.Method === "Split") {
    return resolveSplit(question);
  }

  const columns = Object.keys(row);

  switch (question.Type) {
    case "Multi":
      return resolveMaintainMulti(question, row, columns, options);
    case "Open":
      return resolveMaintainOpen(question, row, columns);
    case "Scale":
    case "Grid":
    case "Single":
    default:
      return resolveMaintainSingle(question, row, columns, options);
  }
}

export function findQuestion(
  definition: Definition,
  name: string,
): Question | undefined {
  const upper = name.toUpperCase();
  return definition.Questions.find((q) => q.Name.toUpperCase() === upper);
}

export function resolveAnswerForQuestion(
  definition: Definition,
  questionName: string,
  row: DataRow,
  options?: MaintainOptions,
): ResolvedAnswer & { question?: Question } {
  const question = findQuestion(definition, questionName);
  if (!question) {
    return {
      codes: [],
      source: "fallback",
      warnings: [`Question '${questionName}' not defined.`],
      question: undefined,
    };
  }
  const result = resolveAnswer(question, row, options);
  return { ...result, question };
}
