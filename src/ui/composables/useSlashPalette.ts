import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { BUILT_IN_SLASH_COMMANDS } from '@/application/chat/builtInSlashCommands';

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
	/** All commands the palette can surface. Frozen at construction. */
	readonly commands: readonly SlashCommand[];
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
}

interface UseSlashPaletteOptions {
	/**
	 * Override the registry. Tests inject a controlled list; production callers
	 * accept the default (`BUILT_IN_SLASH_COMMANDS`).
	 */
	readonly commands?: readonly SlashCommand[];
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
	const commands: readonly SlashCommand[] = options?.commands ?? BUILT_IN_SLASH_COMMANDS;

	const isOpenRef: Ref<boolean> = ref(false);
	const queryRef: Ref<string> = ref('');
	const selectedIndexRef: Ref<number> = ref(-1);

	const matchedCommands = computed<readonly SlashCommand[]>(() => {
		if (!isOpenRef.value) return [];
		return commands.filter((c) => matchesQuery(c, queryRef.value));
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

	function open(query: string): void {
		isOpenRef.value = true;
		queryRef.value = query;
		selectedIndexRef.value = 0;
		clampSelection();
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
	};
}
