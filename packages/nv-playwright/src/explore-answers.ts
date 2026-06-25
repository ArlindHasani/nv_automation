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

export type ExploreAnswerSource =
  | "override"
  | "dataset"
  | "definition"
  | "discovered"
  | "fallback";

export interface ExploreResolvedAnswer {
  codes: string[];
  openText?: string;
  source: ExploreAnswerSource;
  warnings: string[];
}

export interface ExploreAnswerContext {
  overrides?: Record<string, string>;
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
  const overrides = context.overrides ?? {};
  const key = classified.name.toUpperCase();
  const override = overrides[key] ?? overrides[classified.name];

  if (override !== undefined && override !== "") {
    if (classified.type === "Open") {
      return {
        codes: [],
        openText: override,
        source: "override",
        warnings: [],
      };
    }
    return {
      codes: [override],
      source: "override",
      warnings: [],
    };
  }

  if (context.seedRow) {
    const fromRow = resolveRowAnswerForClassified(classified, context.seedRow);
    if (fromRow) return fromRow;

    const question = context.definition
      ? findQuestion(context.definition, classified.name)
      : undefined;
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
  if (codes.length === 0) return "(no coded options on page)";

  return codes
    .map((code) => {
      const label = classified.labels[code];
      return label && label !== code ? `${code} (${label})` : code;
    })
    .join(", ");
}
