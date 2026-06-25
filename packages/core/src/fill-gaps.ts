import type { Definition, InterviewData, Question } from "./schemas.js";
import {
  groupSavColumnsByQuestion,
  inferQuestionTypeFromSav,
  isMetadataQuestionName,
  mergeValueLabelsFromColumns,
  splitFromSavValueLabels,
  type SavVariablesMeta,
} from "./mapping.js";

function buildQuestionFromSav(
  columns: ReturnType<typeof groupSavColumnsByQuestion> extends Map<string, infer V>
    ? V
    : never,
  variables: SavVariablesMeta,
): Question {
  const type = inferQuestionTypeFromSav(columns);
  const name = columns.questionName;

  let split: Record<string, number> = {};
  let labels: Record<string, string> | undefined;

  if (type === "Multi") {
    const mentionCols = columns.mentionColumns.map((m) => m.column);
    const fromVars = mergeValueLabelsFromColumns(mentionCols, variables);
    if (Object.keys(fromVars.split).length > 0) {
      split = fromVars.split;
      labels = fromVars.labels;
    }
  } else if (type === "Single" && columns.valueColumn) {
    const varMeta = variables[columns.valueColumn];
    if (varMeta?.valueLabels && Object.keys(varMeta.valueLabels).length > 0) {
      const fromSav = splitFromSavValueLabels(varMeta.valueLabels);
      split = fromSav.split;
      labels = fromSav.labels;
    } else {
      split = { "": 0.0 };
    }
  } else {
    split = { "": 0.0 };
  }

  return {
    Name: name,
    Method: "Maintain",
    Type: type,
    Answer: null,
    Split: split,
    Filters: null,
    CopyQuestion: null,
    Min: 0,
    Max: 0,
    Values: null,
    AVG: null,
    Labels: labels,
  };
}

function shouldRepairQuestion(
  existing: Question,
  inferred: Question,
): boolean {
  if (existing.Type === "Open" && inferred.Type !== "Open") {
    return true;
  }
  if (existing.Type === "Single" && inferred.Type === "Multi") {
    return true;
  }
  if (
    existing.Type === inferred.Type &&
    Object.keys(existing.Split).filter((k) => k !== "").length === 0 &&
    Object.keys(inferred.Split).filter((k) => k !== "").length > 0
  ) {
    return true;
  }
  return false;
}

function applySavQuestion(target: Question, inferred: Question): void {
  if (shouldRepairQuestion(target, inferred)) {
    target.Type = inferred.Type;
    if (
      inferred.Type === "Multi" ||
      Object.keys(inferred.Split).filter((k) => k !== "").length > 0
    ) {
      target.Split = { ...inferred.Split };
    }
    if ("" in target.Split && Object.keys(inferred.Split).filter((k) => k !== "").length > 0) {
      delete target.Split[""];
    }
  }

  for (const [code, weight] of Object.entries(inferred.Split)) {
    if (code && !(code in target.Split)) {
      target.Split[code] = weight;
    }
  }

  if (inferred.Labels) {
    target.Labels = { ...(target.Labels ?? {}), ...inferred.Labels };
  }
}

export function fillDefinitionGapsFromData(
  definition: Definition,
  data: InterviewData,
  variables: SavVariablesMeta = {},
): { definition: Definition; added: string[]; updated: string[] } {
  const columns =
    data.length > 0 ? Object.keys(data[0] as Record<string, unknown>) : [];
  const grouped = groupSavColumnsByQuestion(columns);
  const existing = new Map(
    definition.Questions.map((q) => [q.Name.toUpperCase(), q]),
  );
  const added: string[] = [];
  const updated: string[] = [];

  for (const [, savCols] of grouped) {
    const name = savCols.questionName;
    if (isMetadataQuestionName(name)) continue;

    const inferred = buildQuestionFromSav(savCols, variables);
    const current = existing.get(name);

    if (!current) {
      existing.set(name, inferred);
      added.push(name);
      continue;
    }

    const before = JSON.stringify({
      type: current.Type,
      split: current.Split,
      labels: current.Labels,
    });
    applySavQuestion(current, inferred);
    const after = JSON.stringify({
      type: current.Type,
      split: current.Split,
      labels: current.Labels,
    });
    if (before !== after) {
      updated.push(name);
    }
  }

  return {
    definition: {
      ...definition,
      Questions: [...existing.values()],
    },
    added,
    updated,
  };
}
