import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "Single",
  "Multi",
  "Open",
  "Scale",
  "Grid",
]);

export const QuestionMethodSchema = z.enum(["Maintain", "Split"]);

export const QuestionSourceSchema = z.enum(["sav", "explore", "manual"]);

export const GridStatementSchema = z.object({
  name: z.string(),
  rowLabel: z.string(),
});

export const QuestionSchema = z.object({
  Name: z.string(),
  Method: QuestionMethodSchema,
  Type: QuestionTypeSchema,
  Answer: z.unknown().nullable().optional(),
  Split: z.record(z.string(), z.number()),
  Filters: z.unknown().nullable().optional(),
  CopyQuestion: z.string().nullable().optional(),
  Min: z.number().optional(),
  Max: z.number().optional(),
  Values: z.unknown().nullable().optional(),
  AVG: z.number().nullable().optional(),
  Labels: z.record(z.string(), z.string()).optional(),
  /** Where this question entry was last populated from. */
  Source: QuestionSourceSchema.optional(),
  /** NV table grid — checkbox vs radio matrix. */
  GridMulti: z.boolean().optional(),
  /** Parent QLABEL when this row is a grid statement (BE151 → BE152). */
  GridScreen: z.string().optional(),
  /** Statement rows on a grid screen (stored on parent Grid question). */
  Statements: z.array(GridStatementSchema).optional(),
  /** Fixed answer when not in dataset (open text or coded value). */
  FixedAnswer: z.string().nullable().optional(),
  /** @deprecated Use FixedAnswer — migrated on read. */
  ExploreOverride: z.string().nullable().optional(),
});

export const DefinitionSchema = z.object({
  Name: z.string(),
  Questions: z.array(QuestionSchema),
  Coherencies: z.array(z.unknown()).default([]),
  Length: z.tuple([z.number(), z.number()]).default([0, 0]),
});

export const SavFieldMapSchema = z.object({
  station: z.string(),
  password: z.string(),
  id: z.string(),
  project: z.string(),
});

export type SavFieldMap = z.infer<typeof SavFieldMapSchema>;

/** SAV column names filled into the NV live login form (one row per interview). */
export const DEFAULT_SAV_FIELD_MAP: SavFieldMap = {
  station: "ws",
  password: "password",
  id: "s_ini",
  project: "project",
};

/** Blank until configured in Setup; otherwise must be a valid URL. */
export const OptionalUrlSchema = z.union([z.literal(""), z.string().url()]);

export const ProjectConfigSchema = z.object({
  name: z.string(),
  nvLoginUrl: OptionalUrlSchema.default(""),
  liveLink: OptionalUrlSchema.default(""),
  testLink: OptionalUrlSchema.default(""),
  mode: z.literal("Freestyle").default("Freestyle"),
  loi: z
    .object({
      targetMinutes: z.number().positive(),
      jitterPercent: z.number().min(0).max(100).default(15),
    })
    .default({ targetMinutes: 12, jitterPercent: 15 }),
  workers: z
    .object({
      maxConcurrent: z.number().int().positive().default(2),
    })
    .default({ maxConcurrent: 2 }),
  savFieldMap: SavFieldMapSchema.default({ ...DEFAULT_SAV_FIELD_MAP }),
  /** Row index in the active dataset used as the guided explore answer profile. */
  exploreSeedRowIndex: z.number().int().min(0).default(0),
  /** How many dataset rows to walk during explore (1 = single guided pass, then stop at interview end). */
  exploreRowCount: z.number().int().min(1).default(1),
  /** Question names that mark interview end during explore (default includes ANMER). */
  exploreEndQuestions: z.array(z.string()).default(["ANMER"]),
});

export const DataRowSchema = z.record(z.string(), z.unknown());

export const InterviewDataSchema = z.array(DataRowSchema);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type QuestionMethod = z.infer<typeof QuestionMethodSchema>;
export type QuestionSource = z.infer<typeof QuestionSourceSchema>;
export type GridStatement = z.infer<typeof GridStatementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Definition = z.infer<typeof DefinitionSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type DataRow = z.infer<typeof DataRowSchema>;
export type InterviewData = z.infer<typeof InterviewDataSchema>;

export const DiscoveredQuestionSchema = z.object({
  name: z.string(),
  type: QuestionTypeSchema,
  codes: z.array(z.string()),
  labels: z.record(z.string(), z.string()).optional(),
  /** NV table grid — one screen, multiple statement rows (QUESTLIST). */
  statements: z
    .array(
      z.object({
        name: z.string(),
        rowLabel: z.string(),
      }),
    )
    .optional(),
  /** Checkbox grid — each statement row is Multi on the NV form. */
  gridMulti: z.boolean().optional(),
});

export type DiscoveredQuestion = z.infer<typeof DiscoveredQuestionSchema>;
