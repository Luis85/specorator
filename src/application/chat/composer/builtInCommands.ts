import type { CatalogEntry } from '@/domain/ports';

/**
 * Built-in slash commands (SPEC-CP-013, REQ-CP-003). Ported from claudian
 * `core/commands/builtInCommands.ts` + the P3 reboot's six-command surface
 * (`/clear /new /add-dir /resume /fork /compact`). Each is a `CatalogEntry` with
 * `builtIn: true`, `prefix: '/'` — they list independent of any catalog load and
 * BEFORE provider entries (the consumer concatenates `listBuiltInCommands()` then
 * the request-guarded `getEntries`, SPEC-CP-018). Pure/total — no `obsidian`/Vue.
 *
 * A built-in maps 1:1 to a `BuiltInAction` (SPEC-CP-013) the consumer dispatches
 * (`/clear`→reset, `/new`→openTab, `/resume`→ResumeSessionDropdown, `/fork`→
 * ForkTargetModal, `/compact`→CompactConversationUseCase, `/add-dir`→add-dir flow).
 */
export type BuiltInAction = 'clear' | 'new' | 'add-dir' | 'resume' | 'fork' | 'compact';

interface BuiltInCommandDefinition {
	readonly name: string;
	readonly action: BuiltInAction;
	readonly description: string;
}

const DEFINITIONS: readonly BuiltInCommandDefinition[] = [
	{ name: 'clear', action: 'clear', description: 'Clear the conversation' },
	{ name: 'new', action: 'new', description: 'Start a new conversation' },
	{ name: 'add-dir', action: 'add-dir', description: 'Add an external context directory' },
	{ name: 'resume', action: 'resume', description: 'Resume a previous conversation' },
	{ name: 'fork', action: 'fork', description: 'Fork the conversation to a new session' },
	{ name: 'compact', action: 'compact', description: 'Compact the conversation context' },
];

/** The six built-ins as catalog entries (builtIn:true, prefix:'/'). */
export const BUILT_IN_COMMANDS: readonly CatalogEntry[] = DEFINITIONS.map((def) => ({
	kind: 'command',
	prefix: '/',
	name: def.name,
	description: def.description,
	builtIn: true,
}));

/**
 * The action a built-in command name resolves to (SPEC-CP-013, REQ-CP-006). A
 * provider entry — or a name absent here — has no action and is inserted instead
 * (REQ-CP-005). Pure lookup, no side effects.
 */
const ACTION_BY_NAME: ReadonlyMap<string, BuiltInAction> = new Map(
	DEFINITIONS.map((def) => [def.name, def.action]),
);

/** The built-in action for a name, or `null` when the name is not an action built-in. */
export function builtInActionFor(name: string): BuiltInAction | null {
	return ACTION_BY_NAME.get(name) ?? null;
}

/**
 * Command names excluded from the palette (REQ-CP-003, EC-CP-8). P4 ships none
 * hidden (the reboot surface is exactly the six listable built-ins); the set is the
 * filter seam so a later phase hides a command without changing `listBuiltInCommands`.
 */
export const HIDDEN_COMMANDS: ReadonlySet<string> = new Set<string>();

/**
 * The built-ins (minus hidden) for the slash palette, listed BEFORE provider
 * entries (SPEC-CP-013, REQ-CP-003). Pure, total — independent of any catalog load.
 */
export function listBuiltInCommands(): CatalogEntry[] {
	return BUILT_IN_COMMANDS.filter((cmd) => !HIDDEN_COMMANDS.has(cmd.name));
}
