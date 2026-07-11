import {
  collectMentionCodesFromRow,
  codesIncludeOtherSpecify,
  formatCodeForQuestion,
  getDataValue,
  getOtherSpecifyTextFromRow,
  getOtherTextColumnForQuestion,
  getValueColumnForQuestion,
} from "./mapping.js";
import { findQuestion, resolveAnswer, resolveSplit } from "./maintain.js";
import {
  hasPositiveSplitWeights,
  normalizeSplitForFixedAnswer,
  splitMatchesFixedAnswer,
} from "./split.js";
import type { DataRow, Definition, Question, QuestionType } from "./schemas.js";

/**
 * Answer policy (explore + live)
 *
 * Definition is a union of SAV import, explore/live merges, and manual edits.
 * The active SAV only drives row values and coverage badges — not hard
 * requirements for every Definition question.
 *
 * | Situation                              | Behavior                                      |
 * |----------------------------------------|-----------------------------------------------|
 * | In active SAV + Maintain               | Use row value                                 |
 * | In active SAV + Split                  | Weighted codes                                |
 * | Not in active SAV + Fixed or Split     | Use FixedAnswer / Split weights               |
 * | Not in active SAV + neither            | Soft-pass (leave unanswered; may be routing)  |
 */

export interface AnswerConfigurationGap {
  question: string;
  type: string;
  reason: string;
}

export type AnswerPolicyMode = "explore" | "live";
export type AnswerPolicySource =
  | "data"
  | "fixed"
  | "split"
  | "fallback"
  | "optional";
export type AnswerPolicyKind =
  | "maintain"
  | "fixed"
  | "split"
  | "unconfigured"
  | "optional";

export interface PolicyResolvedAnswer {
  codes: string[];
  openText?: string;
  statementAnswers?: Record<string, string[]>;
  source: AnswerPolicySource;
  policy: AnswerPolicyKind;
  configured: boolean;
  warnings: string[];
}

export interface ResolveQuestionAnswerInput {
  question: Question | undefined;
  questionName: string;
  questionType: QuestionType;
  row?: DataRow;
  inDataset: boolean;
  mode: AnswerPolicyMode;
  deterministicSeed?: string;
  /** Extra entropy for split sampling (explore run id, live interview id, etc.). */
  splitSeedNonce?: string;
}

/** Read FixedAnswer, falling back to legacy ExploreOverride. */
export function getFixedAnswer(question: Question): string {
  return (question.FixedAnswer ?? question.ExploreOverride ?? "").trim();
}

export function isQuestionInDataset(
  questionName: string,
  questionsInDefinitionNotInData: string[],
): boolean {
  const missing = new Set(
    questionsInDefinitionNotInData.map((name) => name.toUpperCase()),
  );
  return !missing.has(questionName.toUpperCase());
}

export function questionNamesInDataset(
  definition: Definition,
  questionsInDefinitionNotInData: string[],
): Set<string> {
  const missing = new Set(
    questionsInDefinitionNotInData.map((name) => name.toUpperCase()),
  );
  const inDataset = new Set<string>();
  for (const q of definition.Questions) {
    if (!missing.has(q.Name.toUpperCase())) {
      inDataset.add(q.Name.toUpperCase());
    }
  }
  return inDataset;
}

/** True when FixedAnswer or positive Split weights are set (opt-in for not-in-SAV). */
export function hasExplicitNotInDatasetPolicy(question: Question): boolean {
  const fixed = getFixedAnswer(question);
  if (question.Type === "Open") return fixed.length > 0;
  if (fixed) return true;
  return (
    question.Method === "Split" && hasPositiveSplitWeights(question.Split)
  );
}

/**
 * Whether the question is ready for answer-policy gap checks.
 * Not-in-active-SAV questions are always OK (soft-pass by default).
 */
export function isQuestionAnswerConfigured(
  question: Question,
  inDataset: boolean,
): boolean {
  if (!inDataset) return true;

  if (question.Method === "Maintain") return true;
  return hasPositiveSplitWeights(question.Split);
}

function softPassNotInDataset(questionName: string): PolicyResolvedAnswer {
  return {
    codes: [],
    source: "optional",
    policy: "optional",
    configured: true,
    warnings: [
      `Soft-pass for '${questionName}' — leave unanswered / Next with no input (set Fixed or Split only if you need a value)`,
    ],
  };
}

/**
 * Preflight gaps for Definition questions missing from the active SAV.
 * Soft-by-default: never emits gaps (Fixed/Split are opt-in, not required).
 */
export function findAnswerConfigurationGaps(
  _definition: Definition,
  _questionsInDefinitionNotInData: string[],
): AnswerConfigurationGap[] {
  return [];
}

export function findPostExploreConfigurationGaps(
  definition: Definition,
  discoveredNames: string[],
  questionsInDefinitionNotInData: string[],
): AnswerConfigurationGap[] {
  const gaps: AnswerConfigurationGap[] = [];
  const seen = new Set<string>();

  for (const name of discoveredNames) {
    const upper = name.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);

    const q = findQuestion(definition, name);
    if (!q) continue;

    const inDataset = isQuestionInDataset(
      name,
      questionsInDefinitionNotInData,
    );
    // Not-in-SAV is soft-pass; only flag in-dataset questions that need Split weights.
    if (!inDataset) continue;
    if (isQuestionAnswerConfigured(q, true)) continue;

    gaps.push({
      question: q.Name,
      type: q.Type,
      reason: "Discovered question needs answer policy review",
    });
  }

  return gaps;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

function unconfigured(
  questionName: string,
  reason: string,
): PolicyResolvedAnswer {
  return {
    codes: [],
    source: "fallback",
    policy: "unconfigured",
    configured: false,
    warnings: [
      `${reason} — configure Fixed answer or Split weights for '${questionName}' in Definition`,
    ],
  };
}

function fromMaintain(
  result: ReturnType<typeof resolveAnswer>,
  policy: AnswerPolicyKind,
  configured: boolean,
): PolicyResolvedAnswer {
  const source: AnswerPolicySource =
    result.source === "split"
      ? "split"
      : result.source === "data"
        ? "data"
        : "fallback";

  return {
    codes: result.codes,
    openText: result.openText,
    statementAnswers: result.statementAnswers,
    source,
    policy: configured ? policy : "unconfigured",
    configured,
    warnings: result.warnings,
  };
}

function resolveRowAnswerHeuristic(
  questionName: string,
  questionType: QuestionType,
  row: DataRow,
): PolicyResolvedAnswer | null {
  const columns = Object.keys(row);
  const name = questionName.toUpperCase();

  if (questionType === "Open") {
    const openCol =
      getOtherTextColumnForQuestion(name, columns) ??
      `o_${name.toLowerCase()}`;
    const raw = getDataValue(row, openCol);
    if (typeof raw === "string" && raw.length > 0) {
      return {
        codes: [],
        openText: raw,
        source: "data",
        policy: "maintain",
        configured: true,
        warnings: [],
      };
    }
    if (isPresent(raw)) {
      return {
        codes: [],
        openText: String(raw),
        source: "data",
        policy: "maintain",
        configured: true,
        warnings: [],
      };
    }
    return null;
  }

  if (questionType === "Multi") {
    const codes = collectMentionCodesFromRow(name, row, columns);
    if (codes.length > 0) {
      const openText = codesIncludeOtherSpecify(codes)
        ? getOtherSpecifyTextFromRow(name, row) ?? "Other"
        : undefined;
      return {
        codes,
        openText,
        source: "data",
        policy: "maintain",
        configured: true,
        warnings: [],
      };
    }
    return null;
  }

  const valueCol =
    getValueColumnForQuestion(name, columns) ?? name.toLowerCase();
  const raw = getDataValue(row, valueCol);
  if (isPresent(raw)) {
    const codes = [String(raw)];
    const openText = codesIncludeOtherSpecify(codes)
      ? getOtherSpecifyTextFromRow(name, row) ?? "Other"
      : undefined;
    return {
      codes,
      openText,
      source: "data",
      policy: "maintain",
      configured: true,
      warnings: [],
    };
  }
  return null;
}

function resolveFixedCoded(
  question: Question,
  fixed: string,
): PolicyResolvedAnswer {
  const codes = fixed
    .split(/[,+]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((code) => formatCodeForQuestion(question, code));
  return {
    codes,
    source: "fixed",
    policy: "fixed",
    configured: true,
    warnings: [],
  };
}

function buildSplitSeed(
  questionName: string,
  deterministicSeed?: string,
  splitSeedNonce?: string,
): string | undefined {
  const parts = [deterministicSeed ?? questionName, splitSeedNonce].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(":") : undefined;
}

function resolveSplitPolicy(
  question: Question,
  deterministicSeed?: string,
  splitSeedNonce?: string,
): PolicyResolvedAnswer {
  const seed = buildSplitSeed(
    question.Name,
    deterministicSeed,
    splitSeedNonce,
  );
  const result = resolveSplit(question, seed);
  if (result.source === "fallback" || result.codes.length === 0) {
    return unconfigured(
      question.Name,
      "Split weights not configured",
    );
  }
  return fromMaintain(result, "split", true);
}

export function resolveQuestionAnswer(
  input: ResolveQuestionAnswerInput,
): PolicyResolvedAnswer {
  const {
    question,
    questionName,
    questionType,
    row,
    inDataset,
    mode,
    deterministicSeed,
    splitSeedNonce,
  } = input;

  const effectiveType = question?.Type ?? questionType;

  if (!question) {
    // Unknown Open screens soft-pass (click Next empty) once treated as not-in-SAV.
    if (effectiveType === "Open" && !inDataset) {
      return softPassNotInDataset(questionName);
    }
    if (row && inDataset) {
      const fromRow = resolveRowAnswerHeuristic(
        questionName,
        questionType,
        row,
      );
      if (fromRow) return fromRow;
    }
    return unconfigured(
      questionName,
      "Question not in definition",
    );
  }

  const fixed = getFixedAnswer(question);

  if (!inDataset) {
    if (effectiveType === "Open") {
      if (fixed) {
        return {
          codes: [],
          openText: fixed,
          source: "fixed",
          policy: "fixed",
          configured: true,
          warnings: [],
        };
      }
      return softPassNotInDataset(questionName);
    }

    if (fixed) {
      return resolveFixedCoded(question, fixed);
    }

    if (
      question.Method === "Split" &&
      hasPositiveSplitWeights(question.Split)
    ) {
      return resolveSplitPolicy(
        question,
        deterministicSeed ?? `${questionName}`,
        splitSeedNonce,
      );
    }

    return softPassNotInDataset(questionName);
  }

  if (
    question.Method === "Split" &&
    hasPositiveSplitWeights(question.Split)
  ) {
    return resolveSplitPolicy(
      question,
      deterministicSeed ?? `${questionName}`,
      splitSeedNonce,
    );
  }

  if (row) {
    const maintainResult = resolveAnswer(
      question,
      row,
      mode === "explore"
        ? { missingFallback: undefined, allowZero: true }
        : { allowZero: true },
    );
    const configured =
      mode === "live" ? true : maintainResult.source !== "fallback";
    return fromMaintain(maintainResult, "maintain", configured);
  }

  return unconfigured(questionName, "No dataset row available");
}

/** Migrate legacy ExploreOverride → FixedAnswer on definition questions. */
export function migrateFixedAnswerFields(definition: Definition): boolean {
  let changed = false;
  for (const q of definition.Questions) {
    const legacy = q.ExploreOverride?.trim();
    const current = q.FixedAnswer?.trim();
    if (legacy && !current) {
      q.FixedAnswer = legacy;
      changed = true;
    }
    // Soft-by-default replaced AnswerOptional — strip leftover field.
    if ("AnswerOptional" in q) {
      delete (q as { AnswerOptional?: boolean }).AnswerOptional;
      changed = true;
    }
  }
  return changed;
}

/** Clear stale split weights left over when a fixed code was saved. */
export function reconcileFixedAnswerSplits(definition: Definition): boolean {
  let changed = false;
  for (const q of definition.Questions) {
    const fixed = getFixedAnswer(q);
    if (!fixed) continue;
    if (splitMatchesFixedAnswer(q.Split, fixed)) continue;
    q.Split = normalizeSplitForFixedAnswer(q.Split, fixed);
    changed = true;
  }
  return changed;
}

/** Copy legacy project exploreDefaults into question FixedAnswer when unset. */
export function migrateExploreDefaultsToDefinition(
  definition: Definition,
  exploreDefaults: Record<string, string>,
): boolean {
  if (Object.keys(exploreDefaults).length === 0) return false;

  const byName = new Map(
    definition.Questions.map((q) => [q.Name.toUpperCase(), q]),
  );
  let changed = false;

  for (const [name, value] of Object.entries(exploreDefaults)) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const q = byName.get(name.toUpperCase());
    if (q && !getFixedAnswer(q)) {
      q.FixedAnswer = trimmed;
      changed = true;
    }
  }

  return changed;
}

export function fixedAnswersFromDefinition(
  definition: Definition,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of definition.Questions) {
    const value = getFixedAnswer(q);
    if (value) {
      out[q.Name.toUpperCase()] = value;
    }
  }
  return out;
}

export function definitionQuestionsWithFixedAnswer(
  definition: Definition,
): string[] {
  return definition.Questions.filter((q) => getFixedAnswer(q)).map(
    (q) => q.Name,
  );
}
