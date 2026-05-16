/**
 * Plain DTO describing an entry in the slash-command palette (PR-ASV-3 of
 * agent-sidepanel-v2, D-ASV-2). The palette opens when the user types `/` at
 * position 0 of the textarea or after whitespace, and surfaces a filtered list
 * of commands the agent sidepanel knows how to dispatch.
 *
 * Domain layer (ADR-008): no `obsidian` imports. Built-ins are encoded as
 * frozen TypeScript values; future variants `'vault'` / `'sdk'` (PR-ASV-6) will
 * load commands from `.claude/commands/*.md` via `VaultPort` and from the
 * Anthropic Agent SDK's `supportedCommands()` probe.
 *
 * Action ids are kept intentionally narrow — the UI layer maps each id to a
 * concrete dispatch in `ChatSidebar.vue` / `AgentSidepanelRoot.vue`. Keeping
 * the action space closed (rather than handing the dropdown a callback) keeps
 * the domain DTO serialisable for future persistence and lets the test surface
 * assert against string literals.
 */
export interface SlashCommand {
	/** Command name WITHOUT the leading `/`. Lowercased, kebab-case. */
	readonly name: string;
	/** One-line human-readable description shown in the dropdown. */
	readonly description: string;
	/** Source of the command. Today only `'builtin'`; vault/SDK land later. */
	readonly kind: 'builtin';
	/** Action id dispatched by the UI when the user selects this command. */
	readonly action: SlashCommandAction;
}

/**
 * Closed set of dispatch ids the agent sidepanel understands. Keep this list
 * in lockstep with the switch in `AgentSidepanelRoot.handleSelectCommand` (and
 * any future dispatcher).
 */
export type SlashCommandAction =
	| 'clear-input'
	| 'new-conversation'
	| 'help'
	| 'advance-stage';
