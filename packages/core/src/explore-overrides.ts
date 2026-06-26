import type { Definition } from "./schemas.js";

/** Per-question explore overrides stored on Definition.json questions. */
export function exploreOverridesFromDefinition(
  definition: Definition,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of definition.Questions) {
    const value = q.ExploreOverride?.trim();
    if (value) {
      out[q.Name.toUpperCase()] = value;
    }
  }
  return out;
}

export function definitionQuestionsWithExploreOverride(
  definition: Definition,
): string[] {
  return definition.Questions.filter((q) => q.ExploreOverride?.trim()).map(
    (q) => q.Name,
  );
}

export interface ExploreAnswerGap {
  question: string;
  type: string;
  reason: string;
}

/** Definition questions with no SAV column that still need an explore/live answer source. */
export function findExploreAnswerGaps(
  definition: Definition,
  questionsInDefinitionNotInData: string[],
): ExploreAnswerGap[] {
  const notInData = new Set(
    questionsInDefinitionNotInData.map((name) => name.toUpperCase()),
  );
  const gaps: ExploreAnswerGap[] = [];

  for (const q of definition.Questions) {
    if (!notInData.has(q.Name.toUpperCase())) continue;
    if (q.ExploreOverride?.trim()) continue;

    if (q.Type === "Open") {
      gaps.push({
        question: q.Name,
        type: q.Type,
        reason:
          "Not in active dataset — set Explore override (dataset seed row has no value)",
      });
      continue;
    }

    const codes = Object.keys(q.Split).filter((k) => k !== "");
    const hasSplitWeights =
      q.Method === "Split" &&
      codes.some((code) => (q.Split[code] ?? 0) > 0);
    if (hasSplitWeights) continue;

    gaps.push({
      question: q.Name,
      type: q.Type,
      reason:
        "Not in active dataset — set Explore override or configure Split weights",
    });
  }

  return gaps;
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

/** Copy legacy project exploreDefaults into question ExploreOverride when unset. */
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
    if (q && !q.ExploreOverride?.trim()) {
      q.ExploreOverride = trimmed;
      changed = true;
    }
  }

  return changed;
}
