import type { Question } from "./schemas.js";

/** Human-readable type including grid subtypes. */
export function getQuestionDisplayType(question: Question): string {
  if (question.Type === "Grid") {
    return question.GridMulti ? "Grid (multi)" : "Grid (single)";
  }
  if (question.GridScreen) {
    const parent = question.GridScreen;
    return question.Type === "Multi"
      ? `Grid row · multi (${parent})`
      : `Grid row · single (${parent})`;
  }
  return question.Type;
}

export function getQuestionSourceLabel(
  source: Question["Source"],
): string | null {
  if (!source) return null;
  switch (source) {
    case "sav":
      return "SAV";
    case "explore":
      return "Explore";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

export function formatQuestionCodesList(question: Question): string {
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  if (codes.length === 0) return "—";
  const labels = question.Labels ?? {};
  return codes
    .map((c) => {
      const label = labels[c];
      return label && label !== c ? `${c} — ${label}` : c;
    })
    .join(" · ");
}

export function questionCodeCount(question: Question): number {
  return Object.keys(question.Split).filter((k) => k !== "").length;
}
