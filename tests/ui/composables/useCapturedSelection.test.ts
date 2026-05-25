/**
 * T-CA-029 (RED) — `useCapturedSelection` (TEST-CA-013/016 composable legs).
 *
 * SPEC-CA-025, REQ-CA-013/016. The composable subscribes
 * `source.onSelectionChange`, computes the focus-within-chat signal (whether the
 * active element is inside the chat surface — the focus hand-off retain,
 * REQ-CA-016), feeds `CaptureSelectionUseCase.onChange(sel, focusWithinChat)`,
 * and exposes the reactive `current` selection + a `clear()`. Tested over the
 * Mock ports + the recording highlight.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ref, defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useCapturedSelection } from '@/ui/composables/useCapturedSelection';
import { MockSelectionSource, MockSelectionHighlight } from '@/infrastructure/mock/MockSelectionPorts';
import type {
	EditorSelectionContext,
	CapturedSelection,
} from '@/domain/chat/attachments/Selection';

const editorSel: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'hello world',
	startLine: 3,
	lineCount: 2,
};

interface Harness {
	current: () => CapturedSelection | null;
	clear: () => void;
}

let wrappers: VueWrapper[] = [];

afterEach(() => {
	for (const w of wrappers) w.unmount();
	wrappers = [];
});

/**
 * Mount a probe that exposes the composable handles. `chatRoot` is bound to the
 * rendered root so a focus inside it makes the focus-within-chat signal `true`.
 */
function mountProbe(
	source: MockSelectionSource,
	highlight: MockSelectionHighlight,
): { handle: Harness; wrapper: VueWrapper } {
	let handle!: Harness;
	const Probe = defineComponent({
		setup() {
			const chatRoot = ref<HTMLElement | null>(null);
			const captured = useCapturedSelection(source, highlight, chatRoot);
			handle = {
				current: () => captured.current.value,
				clear: () => captured.clear(),
			};
			return () =>
				h('div', { ref: chatRoot, 'data-testid': 'chat-root' }, [
					h('button', { 'data-testid': 'focusable' }, 'in-chat'),
				]);
		},
	});
	const wrapper = mount(Probe, { attachTo: document.body });
	wrappers.push(wrapper);
	return { handle, wrapper };
}

describe('useCapturedSelection (SPEC-CA-025)', () => {
	it('captures an editor selection pushed through onSelectionChange + paints the highlight', async () => {
		const source = new MockSelectionSource();
		const highlight = new MockSelectionHighlight();
		const { handle } = mountProbe(source, highlight);
		source.setSelection(editorSel);
		await nextTick();
		expect(handle.current()).toEqual(editorSel);
		expect(highlight.calls.some((c) => c.kind === 'show')).toBe(true);
	});

	it('a null selection while focus is OUTSIDE the chat surface clears the capture (REQ-CA-015)', async () => {
		const source = new MockSelectionSource();
		const highlight = new MockSelectionHighlight();
		const { handle } = mountProbe(source, highlight);
		source.setSelection(editorSel);
		await nextTick();
		// Focus stays on document.body (outside the chat root) → genuine deselection.
		source.setSelection(null);
		await nextTick();
		expect(handle.current()).toBeNull();
		expect(highlight.calls.some((c) => c.kind === 'clear')).toBe(true);
	});

	it('a null selection while focus is INSIDE the chat surface retains the capture (REQ-CA-016, EC-CA-11)', async () => {
		const source = new MockSelectionSource();
		const highlight = new MockSelectionHighlight();
		const { handle, wrapper } = mountProbe(source, highlight);
		source.setSelection(editorSel);
		await nextTick();
		// Move focus into the chat surface — a focus hand-off, not a deselection.
		(wrapper.get('[data-testid="focusable"]').element as HTMLButtonElement).focus();
		source.setSelection(null);
		await nextTick();
		expect(handle.current()).toEqual(editorSel);
	});

	it('clear() drops the captured selection and clears the highlight', async () => {
		const source = new MockSelectionSource();
		const highlight = new MockSelectionHighlight();
		const { handle } = mountProbe(source, highlight);
		source.setSelection(editorSel);
		await nextTick();
		handle.clear();
		await nextTick();
		expect(handle.current()).toBeNull();
		expect(highlight.calls.some((c) => c.kind === 'clear')).toBe(true);
	});
});
