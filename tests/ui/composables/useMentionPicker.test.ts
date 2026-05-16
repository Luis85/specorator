/**
 * Tests for the `useMentionPicker` composable (PR-ASV-4 / D-ASV-3).
 *
 * Covers trigger detection edges, 200 ms debounce, navigation wrapping,
 * and stale-search discard. Uses `vi.useFakeTimers()` so the 200 ms
 * debounce window is observable without sleeping the runner.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
	useMentionPicker,
	detectTrigger,
	MENTION_DEBOUNCE_MS,
} from '@/ui/composables/useMentionPicker'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

describe('detectTrigger', () => {
	it('detects `@` at position 0', () => {
		const t = detectTrigger('@foo', 4)
		expect(t).toEqual({ atIndex: 0, query: 'foo' })
	})

	it('detects `@` preceded by whitespace', () => {
		const t = detectTrigger('hi @bar', 7)
		expect(t).toEqual({ atIndex: 3, query: 'bar' })
	})

	it('returns null when `@` is preceded by a non-whitespace char', () => {
		// e.g. an email-like context — no mention picker.
		expect(detectTrigger('a@bar', 5)).toBeNull()
	})

	it('returns null when a whitespace appears after the `@`', () => {
		expect(detectTrigger('@foo bar', 8)).toBeNull()
	})

	it('returns null when there is no `@` to the left of the caret', () => {
		expect(detectTrigger('hello world', 5)).toBeNull()
	})

	it('returns empty query for a bare `@` at the caret', () => {
		const t = detectTrigger('@', 1)
		expect(t).toEqual({ atIndex: 0, query: '' })
	})
})

describe('useMentionPicker', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	function makeBridge(files: string[] = ['specs/foo/idea.md', 'specs/foo/requirements.md']) {
		const seed: Record<string, string> = {}
		for (const f of files) seed[f] = ''
		return new MockBridge(seed)
	}

	it('opens the picker when an `@` trigger is detected', () => {
		const picker = useMentionPicker(makeBridge())
		picker.handleInput('@', 1)
		expect(picker.open.value).toBe(true)
		expect(picker.atIndex.value).toBe(0)
		expect(picker.query.value).toBe('')
	})

	it('closes the picker when the trigger is invalidated', () => {
		const picker = useMentionPicker(makeBridge())
		picker.handleInput('@x', 2)
		expect(picker.open.value).toBe(true)
		picker.handleInput('@x y', 4)
		expect(picker.open.value).toBe(false)
	})

	it('debounces the search by 200 ms (Claudian pattern)', async () => {
		const picker = useMentionPicker(makeBridge())
		picker.handleInput('@req', 4)
		// Before the debounce fires no search has run.
		expect(picker.results.value).toEqual([])
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS - 1)
		expect(picker.results.value).toEqual([])
		await vi.advanceTimersByTimeAsync(2)
		expect(picker.results.value.length).toBe(1)
		expect(picker.results.value[0].path).toBe('specs/foo/requirements.md')
	})

	it('caps results and orders prefix-match before contains-only', async () => {
		const bridge = makeBridge([
			'specs/foo/requirements.md',
			'specs/bar/idea.md',
			'specs/zzz/requirements-extras.md',
		])
		const picker = useMentionPicker(bridge)
		picker.handleInput('@requirements', 13)
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
		expect(picker.results.value.map((c) => c.path)).toEqual([
			'specs/foo/requirements.md',
			'specs/zzz/requirements-extras.md',
		])
	})

	it('arrow-down + arrow-up wrap selection', async () => {
		const picker = useMentionPicker(
			makeBridge(['notes/a.md', 'notes/b.md', 'notes/c.md']),
		)
		picker.handleInput('@', 1)
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
		expect(picker.selectedIndex.value).toBe(0)
		picker.moveSelectionDown()
		expect(picker.selectedIndex.value).toBe(1)
		picker.moveSelectionDown()
		picker.moveSelectionDown()
		// wraps back to 0
		expect(picker.selectedIndex.value).toBe(0)
		picker.moveSelectionUp()
		// wraps to last
		expect(picker.selectedIndex.value).toBe(2)
	})

	it('close() clears state and discards a pending debounced scan', async () => {
		const picker = useMentionPicker(makeBridge())
		picker.handleInput('@req', 4)
		picker.close()
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 5)
		expect(picker.open.value).toBe(false)
		expect(picker.results.value).toEqual([])
		expect(picker.atIndex.value).toBe(-1)
	})

	it('currentSelection() returns the highlighted candidate', async () => {
		const picker = useMentionPicker(makeBridge(['notes/a.md', 'notes/b.md']))
		picker.handleInput('@', 1)
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
		expect(picker.currentSelection()?.path).toBe('notes/a.md')
		picker.moveSelectionDown()
		expect(picker.currentSelection()?.path).toBe('notes/b.md')
	})

	it('setSelectedIndex clamps and ignores out-of-range indices', async () => {
		const picker = useMentionPicker(makeBridge(['x/a.md', 'x/b.md']))
		picker.handleInput('@', 1)
		await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
		picker.setSelectedIndex(1)
		expect(picker.selectedIndex.value).toBe(1)
		picker.setSelectedIndex(99)
		expect(picker.selectedIndex.value).toBe(1)
		picker.setSelectedIndex(-1)
		expect(picker.selectedIndex.value).toBe(1)
	})
})
