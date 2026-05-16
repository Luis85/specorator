import type { SlashCommand } from '@/domain/chat/SlashCommand';

/**
 * Built-in slash commands shipped with the agent sidepanel (PR-ASV-3,
 * D-ASV-2). Frozen so consumers cannot mutate the registry at runtime.
 *
 * Order matters: this is the rendering order in the dropdown when the query
 * matches every entry (e.g. the bare `/` trigger). Keep `/help` last so the
 * action surface stays oriented toward "do" verbs before "discover" verbs.
 *
 * `/advance-stage` is a placeholder (Increment 4 lands the real impl). Showing
 * it in the palette today is a deliberate discovery surface — users see it,
 * learn the verb, and the click yields a toast explaining it's not wired up
 * yet.
 */
export const BUILT_IN_SLASH_COMMANDS: readonly SlashCommand[] = Object.freeze([
	Object.freeze({
		name: 'clear',
		description: 'Clear the input box without sending',
		kind: 'builtin' as const,
		action: 'clear-input' as const,
	}),
	Object.freeze({
		name: 'new',
		description: 'Start a new conversation (rotates the active thread)',
		kind: 'builtin' as const,
		action: 'new-conversation' as const,
	}),
	Object.freeze({
		name: 'advance-stage',
		description: 'Advance the active feature to the next stage (coming soon)',
		kind: 'builtin' as const,
		action: 'advance-stage' as const,
	}),
	Object.freeze({
		name: 'help',
		description: 'Show available slash commands',
		kind: 'builtin' as const,
		action: 'help' as const,
	}),
]);
