/**
 * T-CCS-020 — Tests: ContextFileList — empty state, file chips, remove event propagation.
 * Satisfies REQ-CCS-010, REQ-CCS-011, SPEC-CCS-001 §7.3, TEST-CCS-010.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContextFileList from '@/ui/components/chat/ContextFileList.vue'
import type { ContextFileEntry } from '@/ui/stores/chatStore'
import { ContextFileListPO } from './ContextFileList.po'

function makeAutoFile(): ContextFileEntry {
	return { path: 'specs/foo/req.md', label: 'req.md', isAuto: true }
}

function makeManualFile(path = 'notes.md'): ContextFileEntry {
	return { path, label: path, isAuto: false }
}

function mountList(files: ContextFileEntry[], disabled = false) {
	const wrapper = mount(ContextFileList, {
		props: { files, disabled },
	})
	return new ContextFileListPO(wrapper)
}

describe('ContextFileList', () => {
	it('renders data-testid="context-file-list"', () => {
		const po = mountList([])
		expect(po.list.exists()).toBe(true)
	})

	describe('empty state', () => {
		it('shows empty state when files array is empty', () => {
			const po = mountList([])
			expect(po.hasEmptyState()).toBe(true)
		})

		it('does not show empty state when files are present', () => {
			const po = mountList([makeAutoFile()])
			expect(po.hasEmptyState()).toBe(false)
		})
	})

	describe('chip rendering', () => {
		it('renders one auto chip for an auto file', () => {
			const po = mountList([makeAutoFile()])
			expect(po.autoChipCount()).toBe(1)
		})

		it('renders one manual chip for a manual file', () => {
			const po = mountList([makeManualFile()])
			expect(po.manualChipCount()).toBe(1)
		})

		it('renders both auto and manual chips when both present', () => {
			const po = mountList([makeAutoFile(), makeManualFile()])
			expect(po.autoChipCount()).toBe(1)
			expect(po.manualChipCount()).toBe(1)
		})
	})

	describe('remove event propagation', () => {
		it('TEST-CCS-010: remove event from a chip propagates as remove with { path }', async () => {
			const po = mountList([makeManualFile('notes.md')])
			await po.clickFirstRemoveButton()
			const emitted = po.emitted('remove') as Array<[{ path: string }]>
			expect(emitted).toBeTruthy()
			expect(emitted[0][0]).toEqual({ path: 'notes.md' })
		})
	})

	describe('disabled state', () => {
		it('when disabled=true, remove buttons are absent from DOM', () => {
			const po = mountList([makeManualFile()], true)
			expect(po.removeButtonCount()).toBe(0)
		})

		it('when disabled=false, remove buttons are present', () => {
			const po = mountList([makeManualFile()], false)
			expect(po.removeButtonCount()).toBe(1)
		})
	})
})
