/**
 * Plain DTO describing an entry in the slash-command palette (PR-ASV-3 of
 * agent-sidepanel-v2, D-ASV-2). The palette opens when the user types `/` at
 * position 0 of the textarea or after whitespace, and surfaces a filtered list
 * of commands the agent sidepanel knows how to dispatch.
 *
 * Domain layer (ADR-008): no `obsidian` imports. Built-ins are encoded as
 * frozen TypeScript values; vault commands (`.claude/commands/*.md`) and skills
 * (`.claude/skills/<slug>/SKILL.md`) are loaded at runtime by
 * `loadVaultSlashCommands` (application layer). A future `'sdk'` variant
 * (PR-ASV-6) will load commands from the Anthropic Agent SDK's
 * `supportedCommands()` probe.
 *
 * Action ids are kept intentionally narrow — the UI layer maps each id to a
 * concrete dispatch in `ChatSidebar.vue` / `AgentSidepanelRoot.vue`. Keeping
 * the action space closed (rather than handing the dropdown a callback) keeps
 * the domain DTO serialisable for future persistence and lets the test surface
 * assert against string literals.
 *
 * Vault-loaded commands use `action: 'vault-prompt'` — the UI handler inserts
 * `body` into the chat textarea for the user to review before sending, rather
 * than auto-dispatching.
 */
export interface SlashCommand {
	/** Command name WITHOUT the leading `/`. Lowercased, kebab-case. */
	readonly name: string;
	/** One-line human-readable description shown in the dropdown. */
	readonly description: string;
	/** Source of the command. */
	readonly kind: SlashCommandKind;
	/** Action id dispatched by the UI when the user selects this command. */
	readonly action: SlashCommandAction;
	/**
	 * Prompt body that gets inserted into the chat textarea when a vault
	 * command/skill is selected. Required for `action: 'vault-prompt'`; absent
	 * for built-ins.
	 */
	readonly body?: string;
	/** Optional placeholder hint rendered after the description (e.g. `[path]`). */
	readonly argumentHint?: string;
	/** Optional frontmatter pass-through fields — reserved for future use. */
	readonly allowedTools?: readonly string[];
	readonly model?: string;
	readonly context?: string;
	readonly agent?: string;
}

/**
 * Source of a slash command:
 *  - `'builtin'` — shipped with the plugin, dispatched via `SlashCommandAction`
 *  - `'vault-command'` — loaded from `.claude/commands/*.md`
 *  - `'vault-skill'` — loaded from `.claude/skills/<slug>/SKILL.md`
 */
export type SlashCommandKind = 'builtin' | 'vault-command' | 'vault-skill';

/**
 * Closed set of dispatch ids the agent sidepanel understands. Keep this list
 * in lockstep with the switch in `AgentSidepanelRoot.handleSelectCommand` (and
 * any future dispatcher).
 */
export type SlashCommandAction =
	| 'clear-input'
	| 'new-conversation'
	| 'help'
	| 'advance-stage'
	| 'vault-prompt';
