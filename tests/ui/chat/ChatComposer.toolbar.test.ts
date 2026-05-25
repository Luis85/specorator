/**
 * T-TC-027 (RED) — `ChatComposer.vue` P6 toolbar region (TEST-TC-001/043 A legs).
 *
 * SPEC-TC-021. The composer gains an optional `toolbar?: ToolbarViewModel` prop
 * rendering `ToolbarStrip` between the textarea + the footer, re-emitting the four
 * backed changes; with NO `toolbar` prop the composer is byte-identical to P5 (the
 * context-bar/textarea/footer DOM unchanged, EC-TC-14, TEST-TC-043). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-001/002, SPEC-TC-021, NFR-TC-001/004.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import { i18n } from '@/ui/i18n';
import type { ToolbarViewModel } from '@/application/chat/toolbar/buildToolbarViewModel';
import { ChatComposerPageObject } from './ChatComposer.po';

const visible = { kind: 'visible', enabled: true } as const;

function toolbarVm(): ToolbarViewModel {
	return {
		model: {
			visibility: visible,
			options: [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Beta' },
			],
			selectedId: 'a',
			emptyNotice: false,
		},
		mode: {
			visibility: visible,
			descriptor: {
				activeValue: 'accept',
				inactiveValue: 'default',
				activeLabel: 'Accept',
				inactiveLabel: 'Default',
			},
			activeValue: 'default',
		},
		permission: { visibility: { kind: 'visible', enabled: false }, plan: false, deferred: true },
		thinking: { visibility: { kind: 'hidden' }, control: 'none', options: [] },
		serviceTier: { visibility: { kind: 'hidden' }, active: false },
		mcp: { visibility: { kind: 'hidden' }, empty: true },
		external: { visibility: { kind: 'visible', enabled: false }, deferred: true },
		usage: { visibility: { kind: 'hidden' }, percentage: 0, warning: false },
	};
}

function mountComposer(props: { toolbar?: ToolbarViewModel } = {}) {
	const wrapper = mount(ChatComposer, {
		props: { isStreaming: false, toolbar: props.toolbar },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ChatComposerPageObject(wrapper) };
}

describe('ChatComposer P6 toolbar region (SPEC-TC-021)', () => {
	it('TEST-TC-043/EC-TC-14: with no toolbar prop the region is absent (pure P5)', () => {
		const { po } = mountComposer();
		expect(po.exists()).toBe(true);
		expect(po.hasToolbar()).toBe(false);
		expect(po.hasToolbarStrip()).toBe(false);
		// The P5 textarea + footer survive.
		expect(po.textareaExists()).toBe(true);
		expect(po.hasAttach()).toBe(true);
	});

	it('TEST-TC-001: with a toolbar prop the strip mounts between the textarea + footer', () => {
		const { po } = mountComposer({ toolbar: toolbarVm() });
		expect(po.hasToolbar()).toBe(true);
		expect(po.hasToolbarStrip()).toBe(true);
		expect(po.textareaExists()).toBe(true);
	});

	it('re-emits the backed widget change (set-mode) up to the parent', async () => {
		const { wrapper, po } = mountComposer({ toolbar: toolbarVm() });
		await po.clickToolbarMode();
		expect(wrapper.emitted('set-mode')?.[0]).toEqual(['accept']);
	});
});
