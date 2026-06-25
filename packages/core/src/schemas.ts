import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "Single",
  "Multi",
  "Open",
  "Scale",
]);

export const QuestionMethodSchema = z.enum(["Maintain", "Split"]);

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
  group: z.string().optional(),
});

export type SavFieldMap = z.infer<typeof SavFieldMapSchema>;

export const ProjectConfigSchema = z.object({
  name: z.string(),
  nvLoginUrl: z.string().url(),
  liveLink: z.string().default(""),
  testLink: z.string().default(""),
  mode: z.enum(["Cloning", "Freestyle"]).default("Cloning"),
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
  savFieldMap: SavFieldMapSchema,
  /** Test-link overrides while exploring (e.g. IDINT → 0001). Dataset row fills the rest. */
  exploreDefaults: z.record(z.string(), z.string()).default({}),
  /** Row index in the active dataset used as the guided explore answer profile. */
  exploreSeedRowIndex: z.number().int().min(0).default(0),
});

export const DataRowSchema = z.record(z.string(), z.unknown());

export const InterviewDataSchema = z.array(DataRowSchema);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type QuestionMethod = z.infer<typeof QuestionMethodSchema>;
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
});

export type DiscoveredQuestion = z.infer<typeof DiscoveredQuestionSchema>;
