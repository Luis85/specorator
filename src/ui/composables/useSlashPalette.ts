import { computed, ref, inject } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { BUILT_IN_SLASH_COMMANDS } from '@/application/chat/builtInSlashCommands';
import { loadVaultSlashCommands, toSlashCommand } from '@/application/chat/slashCommandLoader';
import type { VaultPort, LoggerPort } from '@/domain/ports';
import { VAULT_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';

/**
 * State machine for the slash-command palette (PR-ASV-3, D-ASV-2). Owns the
 * filtered command list, the highlighted index, and the open/close gate. The
 * trigger-detection scan that opens the palette lives in `ChatInput.vue` —
 * this composable's job is everything that happens *after* the `/` has been
 * accepted.
 *
 * Selection wraps top-to-bottom and bottom-to-top so keyboard navigation is
 * deterministic regardless of match-count, mirroring Claudian's
 * `SlashCommandDropdown` behaviour.
 *
 * The match algorithm is a case-insensitive substring scan against the
 * command's `name` and `description`. A bare `/` (empty query) matches every
 * command — the user gets a full discovery surface. No fuzzy / Levenshtein /
 * prefix matching today; this stays in sync with the design brief in
 * `specs/agent-sidepanel-v2/research.md` D-ASV-2.
 *
 * Built-ins are stable; vault commands (`.claude/commands/*.md` and
 * `.claude/skills/<slug>/SKILL.md`) are refreshed each time the palette opens
 * so vault edits between sessions are picked up. The refresh is fire-and-forget — the
 * dropdown shows built-ins immediately and re-renders when vault commands
 * arrive.
 */
export interface UseSlashPalette {
	/** True while the dropdown is mounted. */
	readonly isOpen: ComputedRef<boolean>;
	/** Current substring query (without the leading `/`). */
	readonly query: ComputedRef<string>;
	/** Commands that match `query` against `name`/`description`. */
	readonly matchedCommands: ComputedRef<readonly SlashCommand[]>;
	/** Highlighted index into `matchedCommands`. `-1` when empty. */
	readonly selectedIndex: ComputedRef<number>;
	/** All commands the palette can surface (built-ins + currently loaded vault). */
	readonly commands: ComputedRef<readonly SlashCommand[]>;
	/** Open the palette with the supplied query. Resets the selection to 0. */
	open(query: string): void;
	/** Close the palette and clear state. */
	close(): void;
	/** Update the query while the palette is open. Resets the selection to 0. */
	setQuery(query: string): void;
	/** Move the selection by `delta` (with wrap-around). No-op when closed. */
	navigate(delta: number): void;
	/**
	 * Return the currently-highlighted command, or `null` when the palette is
	 * closed / has no matches. The caller is responsible for dispatching the
	 * action — `useSlashPalette` does not perform side-effects.
	 */
	select(): SlashCommand | null;
	/**
	 * Explicit handle for tests: reload vault commands without opening the
	 * palette. Production callers should rely on `open()` triggering it.
	 */
	refreshVaultCommands(): Promise<void>;
}

interface UseSlashPaletteOptions {
	/**
	 * Override the built-in registry. Tests inject a controlled list; production
	 * callers accept the default (`BUILT_IN_SLASH_COMMANDS`).
	 */
	readonly commands?: readonly SlashCommand[];
	/**
	 * Inject a `VaultPort` directly (tests). When omitted the composable falls
	 * back to `inject(VAULT_PORT)` — components mounted without the injection
	 * key (unit tests, the standalone browser UI's pre-bridge bootstrap) get an
	 * empty vault-command list.
	 */
	readonly vault?: VaultPort;
	/** Inject a `LoggerPort` for tests. */
	readonly logger?: LoggerPort;
}

function matchesQuery(command: SlashCommand, query: string): boolean {
	if (query.length === 0) return true;
	const needle = query.toLowerCase();
	return (
		command.name.toLowerCase().includes(needle) ||
		command.description.toLowerCase().includes(needle)
	);
}

export function useSlashPalette(options?: UseSlashPaletteOptions): UseSlashPalette {
	const builtIns: readonly SlashCommand[] = options?.commands ?? BUILT_IN_SLASH_COMMANDS;
	const vault: VaultPort | undefined =
		options?.vault ?? inject<VaultPort | undefined>(VAULT_PORT, undefined);
	const logger: LoggerPort | undefined =
		options?.logger ?? inject<LoggerPort | undefined>(LOGGER_PORT, undefined);

	const isOpenRef: Ref<boolean> = ref(false);
	const queryRef: Ref<string> = ref('');
	const selectedIndexRef: Ref<number> = ref(-1);
	const vaultCommandsRef: Ref<readonly SlashCommand[]> = ref([]);
	// Codex P2 (PR #388): monotonically-incrementing token. Each
	// `refreshVaultCommands()` call captures the current value and only
	// commits its result if the token has not been bumped by a later call.
	// Prevents an older, slower vault read from clobbering a newer one when
	// the palette is rapidly reopened.
	let latestRefreshSeq = 0;

	const commands = computed<readonly SlashCommand[]>(() => [
		...builtIns,
		...vaultCommandsRef.value,
	]);

	const matchedCommands = computed<readonly SlashCommand[]>(() => {
		if (!isOpenRef.value) return [];
		return commands.value.filter((c) => matchesQuery(c, queryRef.value));
	});

	function clampSelection(): void {
		const count = matchedCommands.value.length;
		if (count === 0) {
			selectedIndexRef.value = -1;
			return;
		}
		if (selectedIndexRef.value < 0 || selectedIndexRef.value >= count) {
			selectedIndexRef.value = 0;
		}
	}

	async function refreshVaultCommands(): Promise<void> {
		if (vault === undefined) return;
		const seq = ++latestRefreshSeq;
		const loaded = await loadVaultSlashCommands(vault, logger);
		// Drop the result if a newer refresh has been kicked off in the
		// meantime — its eventual completion will commit the up-to-date set.
		if (seq !== latestRefreshSeq) return;
		vaultCommandsRef.value = Object.freeze(loaded.map((c) => toSlashCommand(c)));
		// Re-clamp selection in case the loaded set changed which entries match
		// the current query (e.g. brand-new vault entries widened the result).
		if (isOpenRef.value) clampSelection();
	}

	function open(query: string): void {
		isOpenRef.value = true;
		queryRef.value = query;
		selectedIndexRef.value = 0;
		clampSelection();
		// Fire-and-forget: built-ins are searchable immediately; vault commands
		// appear once the read resolves. Any failure inside the loader is
		// already logged via `LoggerPort.warn` — swallow here so a vault read
		// error never breaks the palette open.
		void refreshVaultCommands().catch(() => {
			/* logged inside loadVaultSlashCommands */
		});
	}

	function close(): void {
		isOpenRef.value = false;
		queryRef.value = '';
		selectedIndexRef.value = -1;
	}

	function setQuery(query: string): void {
		if (!isOpenRef.value) return;
		queryRef.value = query;
		selectedIndexRef.value = 0;
		clampSelection();
	}

	function navigate(delta: number): void {
		if (!isOpenRef.value) return;
		const count = matchedCommands.value.length;
		if (count === 0) {
			selectedIndexRef.value = -1;
			return;
		}
		// Mod-based wrap so `delta = -1` from index 0 lands on the last entry
		// (and `delta = +1` from the last entry wraps to 0). JavaScript's `%`
		// preserves sign for negative numerators, so we offset by `count` before
		// the mod to stay in `[0, count)`.
		const next = (((selectedIndexRef.value + delta) % count) + count) % count;
		selectedIndexRef.value = next;
	}

	function select(): SlashCommand | null {
		if (!isOpenRef.value) return null;
		const list = matchedCommands.value;
		if (list.length === 0) return null;
		const idx = selectedIndexRef.value;
		if (idx < 0 || idx >= list.length) return null;
		return list[idx] ?? null;
	}

	return {
		isOpen: computed(() => isOpenRef.value),
		query: computed(() => queryRef.value),
		matchedCommands,
		selectedIndex: computed(() => selectedIndexRef.value),
		commands,
		open,
		close,
		setQuery,
		navigate,
		select,
		refreshVaultCommands,
	};
}
