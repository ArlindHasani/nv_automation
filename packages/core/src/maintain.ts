import {
  collectMentionCodesFromRow,
  formatCodeForQuestion,
  getDataValue,
  getOtherTextColumnForQuestion,
  getValueColumnForQuestion,
} from "./mapping.js";
import type { DataRow, Definition, Question } from "./schemas.js";

export interface ResolvedAnswer {
  codes: string[];
  openText?: string;
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

function resolveSplit(question: Question): ResolvedAnswer {
  const entries = Object.entries(question.Split).filter(
    ([, weight]) => weight > 0,
  );
  if (entries.length === 0) {
    const codes = Object.keys(question.Split).filter((k) => k !== "");
    const pick = codes[Math.floor(Math.random() * codes.length)] ?? "1";
    return { codes: [pick], source: "split", warnings: [] };
  }

  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [code, weight] of entries) {
    r -= weight;
    if (r <= 0) {
      return { codes: [code], source: "split", warnings: [] };
    }
  }

  return { codes: [entries[0][0]], source: "split", warnings: [] };
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
