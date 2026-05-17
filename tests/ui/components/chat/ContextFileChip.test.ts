/**
 * T-CCS-018 — Tests: ContextFileChip — auto variant, manual variant, disabled state, remove emit.
 * Satisfies REQ-CCS-010, REQ-CCS-011, NFR-CCS-009, SPEC-CCS-001 §7.4, TEST-CCS-011.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContextFileChip from '@/ui/components/chat/ContextFileChip.vue'
import type { ContextFileEntry } from '@/ui/stores/messagesStore'
import { ContextFileChipPO } from './ContextFileChip.po'

function makeAutoFile(): ContextFileEntry {
	return { path: 'specs/foo/req.md', label: 'req.md', isAuto: true }
}

function makeManualFile(): ContextFileEntry {
	return { path: 'notes.md', label: 'notes.md', isAuto: false }
}

function mountChip(file: ContextFileEntry, disabled = false) {
	const wrapper = mount(ContextFileChip, {
		props: { file, disabled },
	})
	return new ContextFileChipPO(wrapper)
}

describe('ContextFileChip', () => {
	describe('auto variant (file.isAuto === true)', () => {
		it('TEST-CCS-011: renders data-testid="context-chip-auto"', () => {
			const po = mountChip(makeAutoFile())
			expect(po.hasAutoChip()).toBe(true)
		})

		it('shows the file label in the chip text', () => {
			const po = mountChip(makeAutoFile())
			expect(po.text()).toContain('req.md')
		})

		it('shows "(auto)" suffix in the chip text', () => {
			const po = mountChip(makeAutoFile())
			expect(po.text()).toContain('(auto)')
		})

		it('REQ-CCS-011: has no remove button for auto chip', () => {
			const po = mountChip(makeAutoFile(), false)
			expect(po.hasRemoveButton()).toBe(false)
		})
	})

	describe('manual variant (file.isAuto === false)', () => {
		it('renders data-testid="context-chip-manual"', () => {
			const po = mountChip(makeManualFile())
			expect(po.hasManualChip()).toBe(true)
		})

		it('shows the file label', () => {
			const po = mountChip(makeManualFile())
			expect(po.text()).toContain('notes.md')
		})

		it('REQ-CCS-010: clicking remove button emits remove event', async () => {
			const po = mountChip(makeManualFile())
			expect(po.hasRemoveButton()).toBe(true)
			await po.clickRemove()
			expect(po.emitted('remove')).toBeTruthy()
		})

		it('keyboard Enter on remove button also emits remove', async () => {
			const po = mountChip(makeManualFile())
			await po.keydownRemove('Enter')
			expect(po.emitted('remove')).toBeTruthy()
		})

		it('keyboard Space on remove button also emits remove', async () => {
			const po = mountChip(makeManualFile())
			await po.keydownRemove(' ')
			expect(po.emitted('remove')).toBeTruthy()
		})
	})

	describe('disabled state', () => {
		it('when disabled=true, remove button is absent from DOM (not just disabled attr)', () => {
			const po = mountChip(makeManualFile(), true)
			expect(po.hasRemoveButton()).toBe(false)
		})

		it('auto chip still has no remove button when disabled=true', () => {
			const po = mountChip(makeAutoFile(), true)
			expect(po.hasRemoveButton()).toBe(false)
		})
	})
})
