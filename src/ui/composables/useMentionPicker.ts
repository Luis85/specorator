/**
 * `@`-file mention picker composable (PR-ASV-4 / IDEA-ASV-001 D-ASV-3).
 *
 * Encapsulates trigger detection, debounced search, and keyboard navigation
 * for the inline `@`-mention dropdown shown beneath `ChatInput`'s
 * textarea. Composable-only — owns no DOM. The `MentionDropdown` component
 * reads `state` and dispatches `commit` on selection; `ChatInput` calls
 * `handleInput` on every keystroke and `handleKey` for navigation keys.
 *
 * The composable is intentionally bridge-agnostic: it accepts a `VaultPort`
 * (injected by the consumer via `useVaultPort()`) so the same code paths
 * exercise MockBridge in unit tests, LocalStorageBridge on GitHub Pages,
 * and ObsidianBridge in production.
 *
 * Debouncing uses raw `setTimeout` rather than `obsidianmd/prefer-active-
 * window-timers` (the rule is disabled for `src/ui/**` — see
 * `eslint.config.js:444`) so the composable works in jsdom unit tests as
 * well as inside Obsidian's popout windows. The 200 ms delay matches
 * Claudian's `MentionDropdownController`.
 */
import { ref, computed, type Ref } from 'vue'
import type { VaultPort } from '@/domain/ports'
import {
	collectVaultFiles,
	matchAndRank,
	prepareCandidates,
	type MentionCandidate,
	type RankedCandidate,
} from '@/application/chat/vaultFileSearch'

/**
 * Debounce window for the search query (Claudian pattern). 200 ms keeps
 * the dropdown responsive without re-scanning the vault on every
 * keystroke.
 */
export const MENTION_DEBOUNCE_MS = 200

/**
 * Outcome of `detectTrigger`. Returned for every `handleInput` call so
 * the composable can decide whether to open, close, or update the
 * dropdown.
 */
export interface MentionTrigger {
	/** Index of the `@` character in the textarea value. */
	readonly atIndex: number
	/** The substring between `@` and the caret (excluding both). */
	readonly query: string
}

/**
 * Backward-scan from `caret` to find the most recent `@` that qualifies
 * as a mention trigger:
 *   - at position 0, OR
 *   - immediately preceded by whitespace.
 *
 * The trigger is aborted if any whitespace appears between `@` and the
 * caret — typing a space dismisses the picker (matching Claudian's
 * `MentionTextProcessor.detectTrigger`).
 *
 * Pure function so the composable can reuse it after debounce ticks
 * without paying a Vue reactivity tax.
 */
export function detectTrigger(value: string, caret: number): MentionTrigger | null {
	for (let i = caret - 1; i >= 0; i--) {
		const ch = value[i]
		if (ch === '@') {
			if (i === 0 || /\s/.test(value[i - 1] ?? '')) {
				const query = value.slice(i + 1, caret)
				return { atIndex: i, query }
			}
			return null
		}
		if (/\s/.test(ch)) return null
	}
	return null
}

/**
 * Public composable surface. `state` is reactive; the rest are
 * imperative handlers driven by `ChatInput` keyboard / input events.
 */
export interface UseMentionPicker {
	readonly open: Readonly<Ref<boolean>>
	readonly query: Readonly<Ref<string>>
	readonly results: Readonly<Ref<readonly MentionCandidate[]>>
	readonly selectedIndex: Readonly<Ref<number>>
	readonly atIndex: Readonly<Ref<number>>
	readonly hasResults: Readonly<Ref<boolean>>
	/**
	 * Called on every textarea `input` event. Detects (or dismisses) the
	 * trigger; schedules a debounced search if open.
	 */
	handleInput(value: string, caret: number): void
	/**
	 * Force-close the picker. Used by `ChatInput` on Escape, on blur, and
	 * on commit.
	 */
	close(): void
	/** Move selection up by one (wraps to the last entry). */
	moveSelectionUp(): void
	/** Move selection down by one (wraps to the first entry). */
	moveSelectionDown(): void
	/** Set the highlighted index (used by mouse hover). */
	setSelectedIndex(index: number): void
	/** Return the currently-highlighted candidate, or null. */
	currentSelection(): MentionCandidate | null
}

/**
 * Construct a picker bound to `vault`. The caller owns the lifecycle:
 * `close()` should be invoked from the consumer's `onBeforeUnmount` to
 * cancel any pending debounce.
 */
export function useMentionPicker(vault: VaultPort): UseMentionPicker {
	const open = ref(false)
	const query = ref('')
	const results = ref<readonly MentionCandidate[]>([])
	const selectedIndex = ref(0)
	const atIndex = ref(-1)

	/**
	 * Cached candidate list for the *current* open session. Re-scanned on
	 * every dropdown open to honor late vault writes; cleared on close.
	 * Pre-lowered for cheaper per-keystroke matching.
	 */
	let cached: RankedCandidate[] | null = null
	let debounceTimer: ReturnType<typeof setTimeout> | null = null
	/**
	 * Monotonic id of the most recent `triggerSearch` invocation. Used to
	 * discard out-of-order scan results — without this guard, a slow
	 * `collectVaultFiles` promise from search #1 can land after search #2
	 * and overwrite the fresher results.
	 */
	let searchSeq = 0
	/**
	 * Shared in-flight vault-scan promise (Codex P2 on PR #376). Without
	 * this, a slow `collectVaultFiles` could let a second debounced
	 * keystroke re-enter the `cached === null` branch and start a second
	 * concurrent recursive walk. Reused across all searches in the open
	 * session; cleared on close alongside `cached`.
	 */
	let inFlightScan: Promise<readonly string[]> | null = null

	function clearDebounce(): void {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
	}

	function applyResults(next: readonly MentionCandidate[]): void {
		results.value = next
		// Clamp selection to the new bounds; default to the first entry on
		// every query change so Enter/Tab targets the top match.
		selectedIndex.value = 0
	}

	async function runSearch(seq: number, q: string): Promise<void> {
		if (cached === null) {
			// Codex P2 on PR #376: share a single in-flight scan promise.
			// `collectVaultFiles` is a recursive walk and the user can
			// type faster than the scan resolves. The previous
			// implementation kicked off a fresh walk on every debounced
			// search until the first one populated `cached`, leading to
			// N concurrent root scans on a large vault.
			inFlightScan ??= collectVaultFiles(vault, '')
			const paths = await inFlightScan
			// Drop the result if the user has typed past this open session
			// (e.g. escape + new `@`) — `searchSeq` was bumped past `seq`.
			if (seq !== searchSeq) return
			// Only the first awaiter populates `cached`; subsequent
			// awaiters see the populated cache and skip the assignment.
			cached ??= prepareCandidates(paths)
		}
		if (seq !== searchSeq) return
		const ranked = matchAndRank(cached, q)
		applyResults(ranked)
	}

	function scheduleSearch(q: string): void {
		clearDebounce()
		const seq = ++searchSeq
		debounceTimer = setTimeout(() => {
			debounceTimer = null
			// Fire-and-forget: vault scan failures should not crash the
			// textarea. The picker simply renders no results.
			void runSearch(seq, q).catch(() => {
				if (seq === searchSeq) applyResults([])
			})
		}, MENTION_DEBOUNCE_MS)
	}

	function openWithTrigger(trigger: MentionTrigger): void {
		const wasOpen = open.value
		open.value = true
		atIndex.value = trigger.atIndex
		query.value = trigger.query
		// Invalidate the candidate cache on each fresh open — picks up
		// vault writes that landed between picker sessions (per the brief).
		if (!wasOpen) {
			cached = null
			inFlightScan = null
		}
		scheduleSearch(trigger.query)
	}

	function close(): void {
		open.value = false
		query.value = ''
		results.value = []
		selectedIndex.value = 0
		atIndex.value = -1
		cached = null
		inFlightScan = null
		clearDebounce()
		// Bump the sequence so any in-flight scan promise is discarded.
		searchSeq++
	}

	function handleInput(value: string, caret: number): void {
		const trigger = detectTrigger(value, caret)
		if (trigger === null) {
			if (open.value) close()
			return
		}
		openWithTrigger(trigger)
	}

	function moveSelectionUp(): void {
		const len = results.value.length
		if (len === 0) return
		selectedIndex.value = (selectedIndex.value - 1 + len) % len
	}

	function moveSelectionDown(): void {
		const len = results.value.length
		if (len === 0) return
		selectedIndex.value = (selectedIndex.value + 1) % len
	}

	function setSelectedIndex(index: number): void {
		const len = results.value.length
		if (len === 0) return
		if (index < 0 || index >= len) return
		selectedIndex.value = index
	}

	function currentSelection(): MentionCandidate | null {
		const list = results.value
		if (list.length === 0) return null
		const idx = selectedIndex.value
		if (idx < 0 || idx >= list.length) return null
		return list[idx]
	}

	const hasResults = computed(() => results.value.length > 0)

	return {
		open,
		query,
		results,
		selectedIndex,
		atIndex,
		hasResults,
		handleInput,
		close,
		moveSelectionUp,
		moveSelectionDown,
		setSelectedIndex,
		currentSelection,
	}
}
