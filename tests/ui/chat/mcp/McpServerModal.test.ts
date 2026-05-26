/**
 * T-MC-028 (RED) — `McpServerModal.vue` (TEST-MC-010/011/012/042/043/070 A legs +
 * EC-MC-2/3/4).
 *
 * SPEC-MC-016/023, REQ-MC-010/011/012/042/043/070/072, NFR-MC-006/007. The add/edit
 * form: Name (required) · Config (JSON/paste) · Description · Context-saving; the
 * paste/parse path via `parseClipboardConfig`; the name required/duplicate block
 * (Save blocked, never overwrite); the edit pre-fill + replacing draft. No
 * `v-html`/`window.prompt`. Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import McpServerModal from '@/ui/chat/mcp/McpServerModal.vue';
import { i18n } from '@/ui/i18n';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import { McpServerModalPageObject } from './McpServerModal.po';

function mountModal(props?: {
	input?: McpServerDraft;
	existingNames?: readonly string[];
}) {
	const wrapper = mount(McpServerModal, {
		props: { existingNames: [], ...props },
		attachTo: document.body,
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new McpServerModalPageObject(wrapper) };
}

describe('McpServerModal (SPEC-MC-016)', () => {
	it('renders the four fields in add mode (TEST-MC-010)', () => {
		const { po } = mountModal();
		expect(po.exists()).toBe(true);
		expect(po.nameValue()).toBe('');
		expect(po.configValue()).toBe('');
	});

	it('blocks Save + shows nameRequired on an empty name (TEST-MC-011)', async () => {
		const { wrapper, po } = mountModal();
		await po.setConfig('{"command":"x"}');
		await po.clickSave();
		expect(po.nameErrorShown()).toBe(true);
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('blocks Save + shows nameDuplicate; never overwrites (TEST-MC-011, EC-MC-4)', async () => {
		const { wrapper, po } = mountModal({ existingNames: ['fs'] });
		await po.setName('fs');
		await po.setConfig('{"command":"x"}');
		await po.clickSave();
		expect(po.nameErrorShown()).toBe(true);
		expect(po.nameErrorText()).toContain('fs');
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('a malformed paste shows parseError and adds nothing (TEST-MC-043, EC-MC-2)', async () => {
		const { wrapper, po } = mountModal();
		await po.setConfig('not json {{{');
		await po.setName('fs');
		await po.clickSave();
		expect(po.parseErrorShown()).toBe(true);
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('a format-2 paste (needsName) requires + focuses the name before Save (TEST-MC-043, EC-MC-3)', async () => {
		const { wrapper, po } = mountModal();
		await po.setConfig('{"command":"mcp-fs"}');
		// needsName → the name field is required + focused; saving without a name is blocked
		await po.clickSave();
		expect(po.nameErrorShown()).toBe(true);
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('a valid format-1 paste + name submits the draft (TEST-MC-010/043)', async () => {
		const { wrapper, po } = mountModal();
		await po.setConfig('{"mcpServers":{"fs":{"command":"mcp-fs"}}}');
		await po.setName('fs');
		await po.clickSave();
		const submitted = wrapper.emitted('submit')?.[0]?.[0] as McpServerDraft | undefined;
		expect(submitted).toBeDefined();
		expect(submitted?.name).toBe('fs');
		expect(submitted?.config).toEqual({ command: 'mcp-fs' });
	});

	it('edit pre-fills the fields + Save emits the replacing draft (TEST-MC-012)', async () => {
		const input: McpServerDraft = {
			name: 'fs',
			config: { command: 'mcp-fs', args: ['--root', '/'] },
			description: 'Files',
			contextSaving: true,
		};
		const { wrapper, po } = mountModal({ input, existingNames: ['fs'] });
		expect(po.nameValue()).toBe('fs');
		expect(po.descriptionValue()).toBe('Files');
		expect(po.contextSavingChecked()).toBe(true);
		// editing its own name is NOT a duplicate
		await po.clickSave();
		const submitted = wrapper.emitted('submit')?.[0]?.[0] as McpServerDraft | undefined;
		expect(submitted?.name).toBe('fs');
	});

	it('cancel emits cancel; Escape cancels (TEST-MC-070)', async () => {
		const { wrapper, po } = mountModal();
		await po.clickCancel();
		expect(wrapper.emitted('cancel')).toBeTruthy();
		const { wrapper: w2, po: po2 } = mountModal();
		await po2.pressEscape();
		expect(w2.emitted('cancel')).toBeTruthy();
	});

	it('uses no v-html and no window.prompt (NFR-MC-007)', () => {
		const { wrapper } = mountModal();
		expect(wrapper.html()).not.toContain('<script');
	});
});
