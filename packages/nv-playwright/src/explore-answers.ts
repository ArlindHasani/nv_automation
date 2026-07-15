import type { ClassifiedQuestion } from "./question-classifier.js";
import {
  collectDatasetColumns,
  collectMentionCodesFromRow,
  findQuestion,
  getFixedAnswer,
  groupSavColumnsByQuestion,
  isQuestionInDataset,
  resolveQuestionAnswer,
  type DataRow,
  type Definition,
  type PolicyResolvedAnswer,
} from "@nv/core";
import {
  normalizeGridStatementCodes,
  resolveGridColumnCode,
} from "./nv-input-actions.js";

export type ExploreAnswerSource =
  | "fixed"
  | "dataset"
  | "split"
  | "fallback"
  | "optional";

export interface ExploreResolvedAnswer {
  codes: string[];
  openText?: string;
  statementAnswers?: Record<string, string[]>;
  source: ExploreAnswerSource;
  policy: PolicyResolvedAnswer["policy"];
  configured: boolean;
  warnings: string[];
}

export interface ExploreAnswerContext {
  seedRow?: DataRow;
  definition?: Definition;
  questionsInDefinitionNotInData?: string[];
  /** All dataset rows — used to detect whether a newly seen question maps to SAV columns. */
  dataRows?: DataRow[];
  datasetRowIndex?: number;
  mode?: "explore" | "live";
  /** Varies split sampling between explore runs or live interviews. */
  splitSeedNonce?: string;
}

function mapSource(source: PolicyResolvedAnswer["source"]): ExploreAnswerSource {
  if (source === "fixed") return "fixed";
  if (source === "data") return "dataset";
  if (source === "split") return "split";
  if (source === "optional") return "optional";
  return "fallback";
}

function toExploreAnswer(result: PolicyResolvedAnswer): ExploreResolvedAnswer {
  return {
    codes: result.codes,
    openText: result.openText,
    statementAnswers: result.statementAnswers,
    source: mapSource(result.source),
    policy: result.policy,
    configured: result.configured,
    warnings: result.warnings,
  };
}

/**
 * Pad Multi answers up to Definition Min using other on-screen codes.
 * Also clamp to Max. NV rejects under-Min / over-Max regardless of source.
 */
export function ensureMultiMinCodes(
  codes: string[],
  classified: ClassifiedQuestion,
  min: number,
  _source?: ExploreAnswerSource,
  max?: number,
): string[] {
  if (classified.type !== "Multi") return codes;

  let out = [...codes];
  const maxSel = max && max > 0 ? max : Number.POSITIVE_INFINITY;
  if (out.length > maxSel) {
    out = out.slice(0, maxSel);
  }

  if (min <= 0 || out.length >= min) {
    return out;
  }

  const skip = new Set(["", "99", "98", "97", ...out]);
  for (const code of classified.codes) {
    if (out.length >= min || out.length >= maxSel) break;
    if (skip.has(code)) continue;
    out.push(code);
    skip.add(code);
  }
  return out;
}

/** True when this question name maps to at least one column in the active SAV/data. */
export function questionHasDatasetColumns(
  questionName: string,
  columns: string[],
): boolean {
  const grouped = groupSavColumnsByQuestion(columns);
  return grouped.has(questionName.toUpperCase());
}

export function resolveQuestionInDataset(
  questionName: string,
  context: ExploreAnswerContext,
): boolean {
  const question = context.definition
    ? findQuestion(context.definition, questionName)
    : undefined;

  if (question && context.questionsInDefinitionNotInData) {
    return isQuestionInDataset(
      questionName,
      context.questionsInDefinitionNotInData,
    );
  }

  const columns =
    context.dataRows && context.dataRows.length > 0
      ? collectDatasetColumns(context.dataRows)
      : context.seedRow
        ? Object.keys(context.seedRow)
        : [];

  if (columns.length > 0) {
    return questionHasDatasetColumns(questionName, columns);
  }

  // No dataset signal: unknown questions are not-in-SAV (soft-pass); known ones stay in-SAV.
  return Boolean(question);
}

/** Prefer a usable scale/code when a visible grid row has no SAV/split answer. */
function fallbackCodesForGridStatement(
  statementName: string,
  availableCodes: string[],
  context: ExploreAnswerContext,
  gridMulti: boolean,
): string[] {
  const question = context.definition
    ? findQuestion(context.definition, statementName)
    : undefined;
  const fixed = question ? getFixedAnswer(question).trim() : "";
  if (fixed) {
    return normalizeGridStatementCodes([fixed], availableCodes);
  }

  const preferred = ["05", "5", "04", "4", "03", "3", "02", "2", "01", "1"];
  for (const code of preferred) {
    const resolved = resolveGridColumnCode(code, availableCodes);
    if (availableCodes.includes(resolved) || availableCodes.includes(code)) {
      return [resolved];
    }
  }

  const first = availableCodes.find(
    (c) => c && !["99", "98", "97", ""].includes(c),
  );
  if (!first) return [];
  return gridMulti ? [first] : [first];
}

function resolveForClassified(
  classified: ClassifiedQuestion,
  context: ExploreAnswerContext,
): ExploreResolvedAnswer {
  const question = context.definition
    ? findQuestion(context.definition, classified.name)
    : undefined;
  const inDataset = resolveQuestionInDataset(classified.name, context);
  const deterministicSeed = `${context.datasetRowIndex ?? 0}:${classified.name}`;

  return toExploreAnswer(
    resolveQuestionAnswer({
      question,
      questionName: classified.name,
      questionType: classified.type,
      row: context.seedRow,
      inDataset,
      mode: context.mode ?? "explore",
      deterministicSeed,
      splitSeedNonce: context.splitSeedNonce,
    }),
  );
}

export function resolveExploreAnswer(
  classified: ClassifiedQuestion,
  context: ExploreAnswerContext = {},
): ExploreResolvedAnswer {
  if (
    classified.type === "Grid" &&
    classified.gridStatements &&
    classified.gridStatements.length > 0
  ) {
    const statementAnswers: Record<string, string[]> = {};
    const warnings: string[] = [];
    let source: ExploreAnswerSource = "dataset";
    let policy: PolicyResolvedAnswer["policy"] = "maintain";
    let configured = true;
    let sawOptional = false;

    for (const stmt of classified.gridStatements) {
      if (classified.gridMulti) {
        const stmtQuestion = context.definition
          ? findQuestion(context.definition, stmt.name)
          : undefined;
        const useDatasetRow =
          stmtQuestion?.Method !== "Split" && context.seedRow;

        if (useDatasetRow) {
          const columns = Object.keys(context.seedRow!);
          const codes = normalizeGridStatementCodes(
            collectMentionCodesFromRow(
              stmt.name,
              context.seedRow!,
              columns,
              stmtQuestion,
            ),
            classified.codes,
          );

          if (codes.length > 0) {
            statementAnswers[stmt.name] = codes;
            continue;
          }
        }

        const sub = resolveForClassified(
          {
            ...classified,
            name: stmt.name,
            type: "Multi",
            gridMulti: false,
          },
          context,
        );
        warnings.push(...sub.warnings);
        if (sub.policy === "optional") {
          sawOptional = true;
          continue;
        }
        if (!sub.configured) {
          configured = false;
          policy = "unconfigured";
          source = "fallback";
          continue;
        }
        if (sub.codes.length > 0) {
          statementAnswers[stmt.name] = sub.codes;
          if (sub.source !== "dataset") {
            source = sub.source;
            policy = sub.policy;
          }
        }
        continue;
      }

      const sub = resolveForClassified(
        { ...classified, name: stmt.name, type: "Single", gridMulti: false },
        context,
      );
      warnings.push(...sub.warnings);
      if (sub.policy === "optional") {
        sawOptional = true;
        continue;
      }
      if (!sub.configured) {
        configured = false;
        policy = "unconfigured";
        source = "fallback";
        continue;
      }
      const code = sub.codes[0];
      if (code) {
        statementAnswers[stmt.name] = [code];
        if (sub.source !== "dataset") {
          source = sub.source;
          policy = sub.policy;
        }
      }
    }

    // Visible grid rows must each have an answer — NV validates every piped brand
    // row. Soft-pass / missing SAV must not leave blanks on screen.
    for (const stmt of classified.gridStatements) {
      if ((statementAnswers[stmt.name] ?? []).length > 0) continue;
      const filled = fallbackCodesForGridStatement(
        stmt.name,
        classified.codes,
        context,
        classified.gridMulti === true,
      );
      if (filled.length === 0) continue;
      statementAnswers[stmt.name] = filled;
      warnings.push(
        `Filled visible grid row ${stmt.name}${stmt.rowLabel ? ` (${stmt.rowLabel})` : ""} with ${filled.join("+")}`,
      );
      if (source === "dataset") source = "fallback";
    }

    if (Object.keys(statementAnswers).length > 0) {
      return {
        codes: [],
        statementAnswers,
        source,
        policy,
        configured,
        warnings,
      };
    }

    const parentInDataset = resolveQuestionInDataset(classified.name, context);
    if (configured && (sawOptional || !parentInDataset)) {
      return {
        codes: [],
        source: "optional",
        policy: "optional",
        configured: true,
        warnings: [
          ...warnings,
          `Soft-pass for grid '${classified.name}' — leave unanswered / Next with no input (set Fixed or Split only if you need a value)`,
        ],
      };
    }

    return {
      codes: [],
      source: "fallback",
      policy: "unconfigured",
      configured: false,
      warnings: [
        ...warnings,
        `No configured answers for grid '${classified.name}'`,
      ],
    };
  }

  return resolveForClassified(classified, context);
}

export function formatDiscoveredOptions(classified: ClassifiedQuestion): string {
  const codes = classified.codes.filter((c) => c !== "");
  const codeText =
    codes.length === 0
      ? "(no coded options on page)"
      : codes
          .map((code) => {
            const label = classified.labels[code];
            return label && label !== code ? `${code} (${label})` : code;
          })
          .join(", ");

  if (classified.gridStatements && classified.gridStatements.length > 0) {
    const rows = classified.gridStatements
      .map((s) => `${s.name}=${s.rowLabel || s.name}`)
      .join(", ");
    const mode = classified.gridMulti ? "multi" : "single";
    return `${codeText} | statements (${mode}): ${rows}`;
  }

  return codeText;
}
