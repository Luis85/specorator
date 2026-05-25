/**
 * Approvals domain barrel (P7, SPEC-AS-004/005). One-stop import for the pure
 * matcher (`getActionPattern`/`getActionDescription`/`matchesRulePattern`) and the
 * rule DTO (`ApprovalRule`/`ApprovalRuleInput`/`ruleDedupeKey`).
 */
export {
	TOOL_BASH,
	TOOL_READ,
	TOOL_WRITE,
	TOOL_EDIT,
	TOOL_NOTEBOOK_EDIT,
	TOOL_GLOB,
	TOOL_GREP,
	getActionPattern,
	getActionDescription,
	matchesRulePattern,
} from './ApprovalMatcher';
export type { ApprovalRule, ApprovalRuleInput } from './ApprovalRule';
export { ruleDedupeKey } from './ApprovalRule';
