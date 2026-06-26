import type { ClassifiedQuestion } from "./question-classifier.js";
import {
  collectMentionCodesFromRow,
  findQuestion,
  formatCodeForQuestion,
  getDataValue,
  getOtherTextColumnForQuestion,
  getValueColumnForQuestion,
  resolveAnswer,
  type DataRow,
  type Definition,
} from "@nv/core";
import { normalizeGridStatementCodes } from "./nv-input-actions.js";

export type ExploreAnswerSource =
  | "override"
  | "dataset"
  | "definition"
  | "discovered"
  | "fallback";

export interface ExploreResolvedAnswer {
  codes: string[];
  openText?: string;
  statementAnswers?: Record<string, string[]>;
  source: ExploreAnswerSource;
  warnings: string[];
}

export interface ExploreAnswerContext {
  seedRow?: DataRow;
  definition?: Definition;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/** Resolve an answer from a SAV row using the live question type (no Definition entry required). */
export function resolveRowAnswerForClassified(
  classified: ClassifiedQuestion,
  row: DataRow,
): ExploreResolvedAnswer | null {
  const columns = Object.keys(row);
  const name = classified.name.toUpperCase();

  if (classified.type === "Open") {
    const openCol =
      getOtherTextColumnForQuestion(name, columns) ??
      `o_${name.toLowerCase()}`;
    const raw = getDataValue(row, openCol);
    if (typeof raw === "string" && raw.length > 0) {
      return { codes: [], openText: raw, source: "dataset", warnings: [] };
    }
    if (isPresent(raw)) {
      return {
        codes: [],
        openText: String(raw),
        source: "dataset",
        warnings: [],
      };
    }
    return null;
  }

  if (classified.type === "Multi") {
    const codes = collectMentionCodesFromRow(name, row, columns);
    if (codes.length > 0) {
      return { codes, source: "dataset", warnings: [] };
    }
    return null;
  }

  const valueCol =
    getValueColumnForQuestion(name, columns) ?? name.toLowerCase();
  const raw = getDataValue(row, valueCol);
  if (isPresent(raw)) {
    return {
      codes: [String(raw)],
      source: "dataset",
      warnings: [],
    };
  }
  return null;
}

function firstDefinitionCode(
  definition: Definition,
  questionName: string,
): string | null {
  const question = findQuestion(definition, questionName);
  if (!question) return null;
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  return codes[0] ?? null;
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
    let anyAnswer = false;

    for (const stmt of classified.gridStatements) {
      if (classified.gridMulti) {
        const columns = context.seedRow
          ? Object.keys(context.seedRow)
          : [];
        const codes = context.seedRow
          ? collectMentionCodesFromRow(
              stmt.name,
              context.seedRow,
              columns,
            )
          : [];
        const normalized = normalizeGridStatementCodes(
          codes,
          classified.codes,
        );
        if (normalized.length > 0) {
          statementAnswers[stmt.name] = normalized;
          anyAnswer = true;
        } else if (classified.codes.length > 0) {
          const fallback = classified.codes.includes("4")
            ? "4"
            : classified.codes[0];
          statementAnswers[stmt.name] = [fallback];
          warnings.push(
            `No dataset mentions for '${stmt.name}' — using code ${fallback}`,
          );
          anyAnswer = true;
        }
        continue;
      }

      const sub = resolveExploreAnswer(
        { ...classified, name: stmt.name, type: "Single", gridMulti: false },
        context,
      );
      warnings.push(...sub.warnings);
      const code = sub.codes[0];
      if (code) {
        statementAnswers[stmt.name] = [code];
        anyAnswer = true;
        if (sub.source !== "dataset" && sub.source !== "override") {
          source = sub.source;
        }
      } else if (sub.source === "override" || sub.source === "dataset") {
        source = sub.source;
      }
    }

    if (anyAnswer) {
      return { codes: [], statementAnswers, source, warnings };
    }
  }

  const defQuestion = context.definition
    ? findQuestion(context.definition, classified.name)
    : undefined;
  const questionOverride = defQuestion?.ExploreOverride?.trim();

  if (questionOverride) {
    if (classified.type === "Open") {
      return {
        codes: [],
        openText: questionOverride,
        source: "override",
        warnings: [],
      };
    }
    return {
      codes: questionOverride.split(/[,+]/).map((c) => c.trim()).filter(Boolean),
      source: "override",
      warnings: [],
    };
  }

  if (context.seedRow) {
    const fromRow = resolveRowAnswerForClassified(classified, context.seedRow);
    if (fromRow) return fromRow;

    const question = defQuestion;
    if (question) {
      const fromDef = resolveAnswer(question, context.seedRow);
      if (fromDef.source === "data") {
        return { ...fromDef, source: "dataset" };
      }
    }
  }

  if (context.definition) {
    const code = firstDefinitionCode(context.definition, classified.name);
    if (code) {
      const question = findQuestion(context.definition, classified.name)!;
      return {
        codes: [formatCodeForQuestion(question, code)],
        source: "definition",
        warnings: [],
      };
    }
  }

  if (classified.type === "Open") {
    return {
      codes: [],
      openText: "test",
      source: "fallback",
      warnings: [
        `No override or dataset value for open question '${classified.name}' — using "test"`,
      ],
    };
  }

  const visibleCodes = classified.codes.filter((c) => c !== "");
  if (visibleCodes.length > 0) {
    return {
      codes: [visibleCodes[0]],
      source: "discovered",
      warnings: [
        `No override or dataset value for '${classified.name}' — using first visible code`,
      ],
    };
  }

  return {
    codes: [],
    source: "fallback",
    warnings: [
      `No answer source for '${classified.name}' — add an explore override or import a dataset`,
    ],
  };
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
