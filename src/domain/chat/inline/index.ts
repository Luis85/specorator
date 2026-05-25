/**
 * Inline-block DTO barrel (SPEC-CP-004). Re-exports the ask-user / exit-plan /
 * approval request + decision DTOs referenced by `StreamChunk` (SPEC-CP-001),
 * `ChatRuntimePort` (SPEC-CP-002), and the inline components (SPEC-CP-022..024).
 */
export type {
	AskUserQuestionOption,
	AskUserQuestionItem,
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
} from './AskUserQuestion';
export type { ExitPlanModeRequest, ExitPlanModeDecision } from './ExitPlanMode';
export type { ApprovalDecision, ApprovalOption, ApprovalRequest } from './Approval';
