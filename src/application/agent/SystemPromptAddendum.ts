/**
 * System-prompt addendum that constrains the sidepanel agent's behaviour when
 * an MCP write tool returns a `pending` status.
 *
 * Satisfies REQ-MHP-032 (verbatim addendum copy) and REQ-MHP-033 (plugin-owned
 * versioned file; not user-mutable, not assembled from settings at runtime).
 *
 * Spec: SPEC-MHP-039. The text below is the Alternative B wording recommended
 * in `specs/mcp-host-side-proposals/research.md` Q6 and reproduced verbatim
 * in REQ-MHP-032. A drift-guard unit test (TEST-MHP-033 / TEST-MHP-034)
 * asserts the constant is byte-equal to that source AND that the source file
 * embeds the literal string statically; any change here must land alongside
 * an update to the requirement text and the test fixture in the same PR.
 *
 * Integration: appended to the sidepanel agent's `--append-system-prompt`
 * suffix via the per-turn assembler in `ChatTurnOrchestrator` (see the
 * T-MHP-130 hook entry in `implementation-log.md`). The constant is
 * statically inlined so the value cannot be influenced by `PluginSettings`,
 * template files, or any other runtime-mutable surface (REQ-MHP-033 /
 * RISK-MHP-008).
 */
export const SYSTEM_PROMPT_ADDENDUM_MHP = `When a write tool returns "status": "pending", the change has not been committed — it is queued for the user. Say so explicitly. Do not claim, summarise, or hint that the change took effect. Do not call workflow_proposal_accept on the user's behalf. The user will accept or reject the proposal; resume only when they tell you the outcome or you observe a follow-up tool call.`
