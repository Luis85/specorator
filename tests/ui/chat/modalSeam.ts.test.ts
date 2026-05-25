/**
 * T-CP-043 (RED) — instruction-confirm seam handle (TEST-CP-011 confirm leg).
 *
 * SPEC-CP-027. The additive `modalSeam.ts` handle: `InstructionConfirmFn`,
 * `InstructionConfirmResult`, the `INSTRUCTION_CONFIRM` InjectionKey, and
 * `useInstructionConfirm()` falling back to an AUTO-REJECT when absent (no
 * provided launcher → no persistence write). Mirrors the P3 `useConfirmDelete`
 * /`useChooseForkTarget` auto-decline fallback.
 *
 * Traces: REQ-CP-017, NFR-CP-003.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
	INSTRUCTION_CONFIRM,
	useInstructionConfirm,
	type InstructionConfirmFn,
	type InstructionConfirmResult,
} from '@/ui/chat/modalSeam';

/** Mount a probe component that calls `useInstructionConfirm()` under a provide. */
function probe(provided?: InstructionConfirmFn): InstructionConfirmFn {
	let captured!: InstructionConfirmFn;
	const Probe = defineComponent({
		setup() {
			captured = useInstructionConfirm();
			return () => h('div');
		},
	});
	mount(Probe, {
		global: provided ? { provide: { [INSTRUCTION_CONFIRM as symbol]: provided } } : {},
	});
	return captured;
}

describe('useInstructionConfirm (TEST-CP-011 confirm leg, SPEC-CP-027)', () => {
	it('returns the provided launcher when INSTRUCTION_CONFIRM is provided', async () => {
		const result: InstructionConfirmResult = { kind: 'accept', instruction: 'be concise' };
		const fn = probe(() => Promise.resolve(result));
		await expect(fn('be concise')).resolves.toEqual(result);
	});

	it('falls back to an auto-reject when no launcher was provided', async () => {
		const fn = probe();
		await expect(fn('anything')).resolves.toEqual({ kind: 'reject' });
	});
});
