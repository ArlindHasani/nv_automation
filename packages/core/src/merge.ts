import type { Definition, DiscoveredQuestion, Question } from "./schemas.js";

export interface MergeResult {
  definition: Definition;
  added: string[];
  updated: string[];
  conflicts: Array<{ name: string; field: string; existing: string; incoming: string }>;
}

function defaultSplit(codes: string[]): Record<string, number> {
  const nonEmpty = codes.filter((c) => c !== "");
  if (nonEmpty.length === 0) return { "": 0.0 };
  return Object.fromEntries(nonEmpty.map((c) => [c, 0.0]));
}

function discoveredToQuestion(
  d: DiscoveredQuestion,
  extra: Partial<Question> = {},
): Question {
  return {
    Name: d.name.toUpperCase(),
    Method: "Maintain",
    Type: d.type,
    Answer: null,
    Split: defaultSplit(d.codes),
    Filters: null,
    CopyQuestion: null,
    Min: 0,
    Max: 0,
    Values: null,
    AVG: null,
    Labels: d.labels,
    Source: "explore",
    ...extra,
  };
}

function applyDiscovery(current: Question, d: DiscoveredQuestion): boolean {
  let changed = false;
  const incomingCodes = d.codes.filter((c) => c !== "");

  if (incomingCodes.length > 0 && current.Type === "Open") {
    current.Type = d.type === "Open" ? "Single" : d.type;
    if ("" in current.Split) {
      delete current.Split[""];
    }
    changed = true;
  } else if (current.Type !== d.type && d.type !== "Open") {
    const existingSparse =
      current.Type === "Open" ||
      Object.keys(current.Split).filter((k) => k !== "").length === 0;
    const exploreWinsType =
      d.type === "Multi" && current.Type === "Single";
    if (incomingCodes.length > 0 && (existingSparse || exploreWinsType)) {
      current.Type = d.type;
      if (exploreWinsType) {
        current.Split = defaultSplit(d.codes);
      }
      if ("" in current.Split) {
        delete current.Split[""];
      }
      changed = true;
    }
  }

  const existingCodes = new Set(Object.keys(current.Split));
  for (const code of d.codes) {
    if (code && !existingCodes.has(code)) {
      current.Split[code] = 0.0;
      changed = true;
    }
  }

  if (d.labels && Object.keys(d.labels).length > 0) {
    const before = JSON.stringify(current.Labels ?? {});
    current.Labels = { ...(current.Labels ?? {}), ...d.labels };
    if (JSON.stringify(current.Labels) !== before) {
      changed = true;
    }
  }

  if (current.Source !== "manual") {
    current.Source = "explore";
  }

  return changed;
}

export function formatQuestionCodes(question: Question): string {
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  if (codes.length === 0) return "";
  const labels = question.Labels ?? {};
  return codes
    .map((c) => (labels[c] && labels[c] !== c ? `${c} (${labels[c]})` : c))
    .join(", ");
}

export function mergeDefinition(
  existing: Definition,
  discovered: DiscoveredQuestion[],
): MergeResult {
  const byName = new Map(
    existing.Questions.map((q) => [q.Name.toUpperCase(), q]),
  );
  const added: string[] = [];
  const updated: string[] = [];
  const conflicts: MergeResult["conflicts"] = [];

  for (const d of discovered) {
    if (d.type === "Grid" && d.statements && d.statements.length > 0) {
      const expansions = d.statements.map((stmt) => ({
        name: stmt.name,
        type: d.gridMulti ? ("Multi" as const) : ("Single" as const),
        codes: d.codes,
        labels: d.labels,
      }));
      for (const item of expansions) {
        mergeOneDiscovery(
          byName,
          item,
          added,
          updated,
          conflicts,
          d.name,
          d.gridMulti,
        );
      }
      continue;
    }

    mergeOneDiscovery(byName, d, added, updated, conflicts);
  }

  const definition: Definition = {
    ...existing,
    Questions: [...byName.values()],
  };

  return { definition, added, updated, conflicts };
}

function mergeOneDiscovery(
  byName: Map<string, Question>,
  d: DiscoveredQuestion,
  added: string[],
  updated: string[],
  conflicts: MergeResult["conflicts"],
  gridScreen?: string,
  gridMulti?: boolean,
): void {
  const name = d.name.toUpperCase();
  const current = byName.get(name);

  if (!current) {
    byName.set(
      name,
      discoveredToQuestion(d, {
        ...(gridScreen
          ? {
              GridScreen: gridScreen.toUpperCase(),
              GridMulti: gridMulti,
            }
          : {}),
      }),
    );
    added.push(name);
    return;
  }

  if (gridScreen) {
    if (current.GridScreen !== gridScreen.toUpperCase()) {
      current.GridScreen = gridScreen.toUpperCase();
    }
    if (gridMulti !== undefined && current.GridMulti !== gridMulti) {
      current.GridMulti = gridMulti;
    }
  }

  const incomingCodes = d.codes.filter((c) => c !== "");
  const isGridStatementResolution =
    current.Type === "Grid" && (d.type === "Single" || d.type === "Multi");

  const typeConflict =
    !isGridStatementResolution &&
    current.Type !== d.type &&
    d.type !== "Open" &&
    incomingCodes.length > 0 &&
    current.Type !== "Open" &&
    !(current.Type === "Single" && d.type === "Multi") &&
    Object.keys(current.Split).filter((k) => k !== "").length > 0;

  if (typeConflict) {
    conflicts.push({
      name,
      field: "Type",
      existing: current.Type,
      incoming: d.type,
    });
    if (isGridStatementResolution || applyDiscovery(current, d)) {
      if (isGridStatementResolution) {
        current.Type = d.type;
      }
      updated.push(name);
    }
    return;
  }

  if (isGridStatementResolution) {
    current.Type = d.type;
    if (applyDiscovery(current, d)) {
      updated.push(name);
    } else {
      updated.push(name);
    }
    return;
  }

  if (applyDiscovery(current, d)) {
    updated.push(name);
  }
}
