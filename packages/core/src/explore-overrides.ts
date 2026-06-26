/** @deprecated Import from answer-policy.js instead. */
export {
  type AnswerConfigurationGap as ExploreAnswerGap,
  findAnswerConfigurationGaps as findExploreAnswerGaps,
  fixedAnswersFromDefinition as exploreOverridesFromDefinition,
  definitionQuestionsWithFixedAnswer as definitionQuestionsWithExploreOverride,
  migrateExploreDefaultsToDefinition,
  questionNamesInDataset,
  getFixedAnswer,
  isQuestionAnswerConfigured,
  isQuestionInDataset,
} from "./answer-policy.js";
