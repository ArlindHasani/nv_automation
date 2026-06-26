import type { DiscoveredQuestion } from "./schemas.js";
import type { MergeResult } from "./merge.js";

export interface MergeValidationIssue {
  severity: "error" | "warn";
  question: string;
  message: string;
}

/** Pre-merge checks on live discovery trail. */
export function validateDiscoveryForMerge(
  discovered: DiscoveredQuestion[],
): MergeValidationIssue[] {
  const issues: MergeValidationIssue[] = [];

  for (const d of discovered) {
    const codes = d.codes.filter((c) => c !== "");

    if (d.type !== "Open" && d.type !== "Grid" && codes.length === 0) {
      issues.push({
        severity: "warn",
        question: d.name,
        message: "No answer codes detected on page",
      });
    }

    if (d.type === "Grid") {
      if (!d.statements || d.statements.length < 2) {
        issues.push({
          severity: "error",
          question: d.name,
          message: "Grid screen missing QUESTLIST statement rows",
        });
      } else if (codes.length === 0) {
        issues.push({
          severity: "warn",
          question: d.name,
          message: "Grid screen has no column codes",
        });
      }
    }
  }

  return issues;
}

/** Post-merge review items (conflicts + coverage gaps). */
export function validateMergedDefinition(input: {
  mergeResult: MergeResult;
  discoveryIssues: MergeValidationIssue[];
  questionsInDataNotInDefinition: string[];
}): MergeValidationIssue[] {
  const issues = [...input.discoveryIssues];

  for (const c of input.mergeResult.conflicts) {
    if (
      c.field === "Type" &&
      c.existing === "Grid" &&
      (c.incoming === "Single" || c.incoming === "Multi")
    ) {
      continue;
    }
    issues.push({
      severity: "warn",
      question: c.name,
      message: `${c.field} conflict: ${c.existing} vs ${c.incoming}`,
    });
  }

  for (const name of input.questionsInDataNotInDefinition) {
    issues.push({
      severity: "warn",
      question: name,
      message: "In dataset but missing from definition — run Fix gaps",
    });
  }

  return issues;
}
