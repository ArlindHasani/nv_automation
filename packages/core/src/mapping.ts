import type { DataRow, Definition, Question, QuestionType } from "./schemas.js";

export type SavColumnRole = "value" | "otherText" | "mention";

export interface SavColumnMapping {
  column: string;
  questionName: string;
  /** Mention slot index (scr1m2 → 2). Code comes from the cell value, not the suffix. */
  slot?: number;
  role: SavColumnRole;
}

const MENTION_SUFFIX = /^(.+?)m(\d+)$/i;
const OPEN_OTHER_PREFIX = /^o_(.+)$/i;

const SAV_SENTINEL_CODES = new Set(["-9999", "-9998", "-99", "99"]);

/** Map a SAV column name to NV question + role. */
export function mapSavColumn(column: string): SavColumnMapping | null {
  const lower = column.toLowerCase();

  if (lower.startsWith("ck_") || lower === "filter_$" || lower === "filt") {
    return null;
  }

  const otherMatch = lower.match(OPEN_OTHER_PREFIX);
  if (otherMatch) {
    return {
      column,
      questionName: otherMatch[1].toUpperCase(),
      role: "otherText",
    };
  }

  const mentionMatch = lower.match(MENTION_SUFFIX);
  if (mentionMatch) {
    const base = mentionMatch[1];
    const slot = parseInt(mentionMatch[2], 10);
    return {
      column,
      questionName: base.toUpperCase(),
      slot: Number.isNaN(slot) ? undefined : slot,
      role: "mention",
    };
  }

  if (/^[a-z][a-z0-9_]*$/i.test(lower)) {
    return {
      column,
      questionName: lower.toUpperCase(),
      role: "value",
    };
  }

  return null;
}

export interface SavQuestionColumns {
  questionName: string;
  valueColumn: string | null;
  otherTextColumn: string | null;
  mentionColumns: SavColumnMapping[];
}

/** Group SAV columns by NV question name. */
export function groupSavColumnsByQuestion(
  columns: string[],
): Map<string, SavQuestionColumns> {
  const grouped = new Map<string, SavQuestionColumns>();

  for (const col of columns) {
    const mapping = mapSavColumn(col);
    if (!mapping) continue;

    const name = mapping.questionName;
    if (!grouped.has(name)) {
      grouped.set(name, {
        questionName: name,
        valueColumn: null,
        otherTextColumn: null,
        mentionColumns: [],
      });
    }
    const entry = grouped.get(name)!;

    if (mapping.role === "value") {
      entry.valueColumn = mapping.column;
    } else if (mapping.role === "otherText") {
      entry.otherTextColumn = mapping.column;
    } else if (mapping.role === "mention") {
      entry.mentionColumns.push(mapping);
    }
  }

  return grouped;
}

/** Infer NV question type from SAV column layout (not from o_ companion alone). */
export function inferQuestionTypeFromSav(columns: SavQuestionColumns): QuestionType {
  if (columns.mentionColumns.length > 0) {
    return "Multi";
  }
  if (columns.valueColumn) {
    return "Single";
  }
  if (columns.otherTextColumn) {
    return "Open";
  }
  return "Open";
}

export function getValueColumnForQuestion(
  questionName: string,
  columns: string[],
): string | null {
  const grouped = groupSavColumnsByQuestion(columns);
  return grouped.get(questionName.toUpperCase())?.valueColumn ?? null;
}

export function getOtherTextColumnForQuestion(
  questionName: string,
  columns: string[],
): string | null {
  const grouped = groupSavColumnsByQuestion(columns);
  return grouped.get(questionName.toUpperCase())?.otherTextColumn ?? null;
}

/** Infer code width from existing Split keys on a question. */
export function inferCodeWidth(question: Question): number {
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  if (codes.length === 0) return 0;
  const numericCodes = codes.filter((c) => /^\d+$/.test(c));
  if (numericCodes.length === 0) return 0;
  return Math.max(...numericCodes.map((c) => c.length));
}

export function formatCodeForQuestion(
  question: Question,
  rawCode: string | number,
): string {
  const code = String(rawCode);
  const width = inferCodeWidth(question);
  if (width > 0 && /^\d+$/.test(code)) {
    return code.padStart(width, "0");
  }
  return code;
}

function isPresentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/** Merge value-label sets from one or more SAV columns (variable view). */
export function mergeValueLabelsFromColumns(
  columnNames: string[],
  variables: SavVariablesMeta,
): { split: Record<string, number>; labels: Record<string, string> } {
  let split: Record<string, number> = {};
  let labels: Record<string, string> = {};

  for (const col of columnNames) {
    const valueLabels = variables[col]?.valueLabels;
    if (!valueLabels || Object.keys(valueLabels).length === 0) continue;
    const parsed = splitFromSavValueLabels(valueLabels);
    split = { ...split, ...parsed.split };
    labels = { ...labels, ...parsed.labels };
  }

  return { split, labels };
}

/**
 * Mention-style multi (scr1m1, be1_2m3): each column is a mention slot;
 * the cell value is the selected answer code.
 */
export function collectMentionCodesFromRow(
  questionName: string,
  row: DataRow,
  columns: string[],
  question?: Question,
): string[] {
  const mappings = buildColumnIndex(columns).get(questionName.toUpperCase()) ?? [];
  const codes: string[] = [];

  const mentionMappings = mappings
    .filter((m) => m.role === "mention")
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));

  for (const m of mentionMappings) {
    const raw = getDataValue(row, m.column);
    if (!isPresentValue(raw)) continue;
    const code = question
      ? formatCodeForQuestion(question, raw as string | number)
      : String(raw);
    if (!codes.includes(code)) codes.push(code);
  }

  return codes;
}

/** Build index: question name -> list of column mappings. */
export function buildColumnIndex(
  columns: string[],
): Map<string, SavColumnMapping[]> {
  const index = new Map<string, SavColumnMapping[]>();

  for (const col of columns) {
    const mapping = mapSavColumn(col);
    if (!mapping) continue;
    const existing = index.get(mapping.questionName) ?? [];
    existing.push(mapping);
    index.set(mapping.questionName, existing);
  }

  return index;
}

const METADATA_COLUMNS = new Set([
  "CATI",
  "USED",
  "ID",
  "NOMP",
  "QUEST",
  "WS",
  "PASSWORD",
  "S_INI",
]);

export interface CoverageReport {
  mappedColumns: SavColumnMapping[];
  unmappedColumns: string[];
  questionsInDataNotInDefinition: string[];
  questionsInDefinitionNotInData: string[];
  nvSessionFieldsPresent: Record<string, boolean>;
}

export function buildCoverageReport(
  dataRows: DataRow[],
  definition: Definition,
  savFieldMap: Record<string, string>,
): CoverageReport {
  const columns =
    dataRows.length > 0
      ? Object.keys(dataRows[0] as Record<string, unknown>)
      : [];

  const columnIndex = buildColumnIndex(columns);
  const mappedColumns: SavColumnMapping[] = [];
  const unmappedColumns: string[] = [];

  for (const col of columns) {
    const mapping = mapSavColumn(col);
    if (mapping) mappedColumns.push(mapping);
    else if (!col.startsWith("ck_") && col !== "filter_$" && col !== "filt") {
      unmappedColumns.push(col);
    }
  }

  const defNames = new Set(
    definition.Questions.map((q) => q.Name.toUpperCase()),
  );
  const dataQuestionNames = new Set(columnIndex.keys());

  const questionsInDataNotInDefinition = [...dataQuestionNames].filter(
    (n) => !defNames.has(n) && !METADATA_COLUMNS.has(n),
  );
  const questionsInDefinitionNotInData = [...defNames].filter(
    (n) => !dataQuestionNames.has(n),
  );

  const sample = dataRows[0] ?? {};
  const nvSessionFieldsPresent: Record<string, boolean> = {};
  for (const field of Object.values(savFieldMap)) {
    nvSessionFieldsPresent[field] = field in sample;
  }

  return {
    mappedColumns,
    unmappedColumns,
    questionsInDataNotInDefinition,
    questionsInDefinitionNotInData,
    nvSessionFieldsPresent,
  };
}

export function getDataValue(
  row: DataRow,
  column: string,
): unknown | undefined {
  const lower = column.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export interface SavValueLabels {
  [code: string]: string;
}

export type SavVariablesMeta = Record<
  string,
  { valueLabels?: SavValueLabels }
>;

const SENTINEL_LABEL_PATTERNS = /refus|don't know|no answer|dk|na\b/i;

/** Convert SPSS value labels on a column into NV Split + Labels. */
export function splitFromSavValueLabels(
  valueLabels: SavValueLabels,
): { split: Record<string, number>; labels: Record<string, string> } {
  const split: Record<string, number> = {};
  const labels: Record<string, string> = {};

  const numericEntries = Object.entries(valueLabels).filter(([k]) => {
    const n = Number(k);
    return !Number.isNaN(n);
  });

  const width =
    numericEntries.length > 0
      ? Math.max(
          ...numericEntries.map(([k]) =>
            String(Math.trunc(Number(k))).length,
          ),
        )
      : 0;

  for (const [rawKey, label] of Object.entries(valueLabels)) {
    const num = Number(rawKey);
    let code: string;
    if (!Number.isNaN(num)) {
      if (SAV_SENTINEL_CODES.has(String(Math.trunc(num)))) continue;
      code = width > 0 ? String(Math.trunc(num)).padStart(width, "0") : String(Math.trunc(num));
    } else {
      code = rawKey;
    }

    if (SENTINEL_LABEL_PATTERNS.test(label) && SAV_SENTINEL_CODES.has(code)) {
      continue;
    }

    split[code] = 0.0;
    labels[code] = label;
  }

  return { split, labels };
}

export function isMetadataQuestionName(name: string): boolean {
  return METADATA_COLUMNS.has(name.toUpperCase());
}
