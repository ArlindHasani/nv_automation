import type { ClassifiedQuestion } from "./question-classifier.js";
import {
  collectMentionCodesFromRow,
  findQuestion,
  isQuestionInDataset,
  resolveQuestionAnswer,
  type DataRow,
  type Definition,
  type PolicyResolvedAnswer,
} from "@nv/core";
import { normalizeGridStatementCodes } from "./nv-input-actions.js";

export type ExploreAnswerSource =
  | "fixed"
  | "dataset"
  | "split"
  | "fallback";

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
  datasetRowIndex?: number;
  mode?: "explore" | "live";
}

function mapSource(source: PolicyResolvedAnswer["source"]): ExploreAnswerSource {
  if (source === "fixed") return "fixed";
  if (source === "data") return "dataset";
  if (source === "split") return "split";
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

function resolveForClassified(
  classified: ClassifiedQuestion,
  context: ExploreAnswerContext,
): ExploreResolvedAnswer {
  const question = context.definition
    ? findQuestion(context.definition, classified.name)
    : undefined;
  const inDataset = context.questionsInDefinitionNotInData
    ? isQuestionInDataset(
        classified.name,
        context.questionsInDefinitionNotInData,
      )
    : true;
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

    for (const stmt of classified.gridStatements) {
      if (classified.gridMulti) {
        const columns = context.seedRow
          ? Object.keys(context.seedRow)
          : [];
        const codes = context.seedRow
          ? normalizeGridStatementCodes(
              collectMentionCodesFromRow(
                stmt.name,
                context.seedRow,
                columns,
              ),
              classified.codes,
            )
          : [];

        if (codes.length > 0) {
          statementAnswers[stmt.name] = codes;
          continue;
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
