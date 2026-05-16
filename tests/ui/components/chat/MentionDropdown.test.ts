/**
 * Tests for the `MentionDropdown` listbox component (PR-ASV-4 / D-ASV-3).
 *
 * Verifies the ARIA contract (`role=listbox`, `role=option`,
 * `aria-selected`), keyboard-agnostic selection (mousedown emits
 * `select`), and hover-emits-index so the consumer can sync
 * `useMentionPicker.setSelectedIndex`.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MentionDropdown from '@/ui/components/chat/MentionDropdown.vue'
import type { MentionCandidate } from '@/application/chat/vaultFileSearch'
import { MentionDropdownPO } from './MentionDropdown.po'

const candidates: MentionCandidate[] = [
	{ path: 'specs/foo/idea.md', name: 'idea.md' },
	{ path: 'specs/foo/requirements.md', name: 'requirements.md' },
	{ path: 'specs/bar/idea.md', name: 'idea.md' },
]

function mountDropdown(props: {
	results: MentionCandidate[]
	selectedIndex: number
}): MentionDropdownPO {
	return new MentionDropdownPO(mount(MentionDropdown, { props }))
}

describe('MentionDropdown', () => {
	it('renders nothing when results array is empty', () => {
		const po = mountDropdown({ results: [], selectedIndex: 0 })
		expect(po.dropdownExists()).toBe(false)
	})

	it('renders one option per result with role="option"', () => {
		const po = mountDropdown({ results: candidates, selectedIndex: 0 })
		expect(po.dropdownExists()).toBe(true)
		expect(po.optionCount()).toBe(3)
	})

	it('container has role="listbox"', () => {
		const po = mountDropdown({ results: candidates, selectedIndex: 0 })
		expect(po.hasRoleListbox()).toBe(true)
	})

	it('marks the selected index with aria-selected="true"', () => {
		const po = mountDropdown({ results: candidates, selectedIndex: 1 })
		expect(po.optionIsSelected(0)).toBe(false)
		expect(po.optionIsSelected(1)).toBe(true)
		expect(po.optionIsSelected(2)).toBe(false)
	})

	it('mousedown on an option emits `select` with the candidate', async () => {
		const po = mountDropdown({ results: candidates, selectedIndex: 0 })
		await po.clickOption(2)
		const emitted = po.emitted('select') as MentionCandidate[][]
		expect(emitted).toBeTruthy()
		expect(emitted[0][0]).toEqual(candidates[2])
	})

	it('mouseenter on an option emits `hover` with the index', async () => {
		const po = mountDropdown({ results: candidates, selectedIndex: 0 })
		await po.hoverOption(1)
		const emitted = po.emitted('hover') as number[][]
		expect(emitted).toBeTruthy()
		expect(emitted[0][0]).toBe(1)
	})
})
