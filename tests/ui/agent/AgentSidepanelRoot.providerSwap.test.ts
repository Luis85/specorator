/**
 * Provider-swap brand recolour test for `AgentSidepanelRoot` (REQ-AUX-006).
 *
 * Mounts the root, injects `src/ui/styles/tokens.css` into the jsdom
 * document, flips `chatProviderStore.resolved`, and asserts that
 * `getComputedStyle(root).getPropertyValue('--sp-brand')` reflects the
 * brand value mapped by the `[data-provider="<id>"]` selector in
 * tokens.css — without the root element being re-created.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';

import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { i18n } from '@/ui/i18n';
import { LOGGER_PORT, NOTIFICATION_PORT, VAULT_PORT } from '@/infrastructure/bridge/ports';
import type { LoggerPort, NotificationPort, VaultPort } from '@/domain/ports';

const TOKENS_PATH = resolve(__dirname, '../../../src/ui/styles/tokens.css');

const noopLogger: LoggerPort = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};
const noopNotifications: NotificationPort = {
	showError: () => undefined,
	showWarning: () => undefined,
	showSuccess: () => undefined,
	showInfo: () => undefined,
};
const noopVault: VaultPort = {
	readFile: async () => '',
	writeFile: async () => undefined,
	deleteFile: async () => undefined,
	listFiles: async () => [],
	listFolders: async () => [],
	fileExists: async () => false,
	createFolder: async () => undefined,
};

const ChildStub = defineComponent({
	name: 'ChildStub',
	render() {
		return h('div', { 'data-testid': 'child-stub' });
	},
});

let injectedStyle: HTMLStyleElement | null = null;

function injectTokens(): void {
	const css = readFileSync(TOKENS_PATH, 'utf8');
	const style = document.createElement('style');
	style.setAttribute('data-test-style', 'tokens');
	style.textContent = css;
	document.head.appendChild(style);
	injectedStyle = style;
}

function removeTokens(): void {
	if (injectedStyle !== null) {
		injectedStyle.remove();
		injectedStyle = null;
	}
}

function mountRoot(): { wrapper: VueWrapper; pinia: Pinia } {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(AgentSidepanelRoot, {
		attachTo: document.body,
		global: {
			plugins: [pinia, i18n],
			stubs: {
				ChatSidebar: ChildStub,
				MessageList: ChildStub,
				StatusPanel: ChildStub,
				AttachmentStrip: ChildStub,
				ProviderBadge: ChildStub,
				ModelSelector: ChildStub,
				AppToast: ChildStub,
				A11yAnnouncer: ChildStub,
				AgentSidepanelHeader: ChildStub,
				ThreadTabStrip: ChildStub,
			},
			provide: {
				[LOGGER_PORT as symbol]: noopLogger,
				[NOTIFICATION_PORT as symbol]: noopNotifications,
				[VAULT_PORT as symbol]: noopVault,
			},
		},
	});
	return { wrapper, pinia };
}

function readBrand(rootEl: HTMLElement): string {
	return getComputedStyle(rootEl).getPropertyValue('--sp-brand').trim();
}

describe('AgentSidepanelRoot — provider swap recolours brand (REQ-AUX-006)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		injectTokens();
	});

	afterEach(() => {
		removeTokens();
	});

	it('flips --sp-brand on data-provider swap without remount', async () => {
		const { wrapper, pinia } = mountRoot();
		const providerStore = useChatProviderStore(pinia);

		// Start with an explicit claude resolution.
		providerStore.setResolved({ provider: 'claude', mode: 'cli' });
		await nextTick();
		const rootEl = wrapper.find<HTMLElement>('[data-testid="agent-sidepanel"]').element;
		const firstRef = rootEl;
		// jsdom does not resolve nested `var()` chains, so `--sp-brand`
		// reports its literal declared value. The `[data-provider="claude"]`
		// override sets it to `var(--sp-brand-claude)`. We assert the chain
		// endpoint (the brand literal) and the indirection token separately:
		const brandClaudeLiteral = getComputedStyle(rootEl)
			.getPropertyValue('--sp-brand-claude')
			.trim()
			.toLowerCase();
		expect(brandClaudeLiteral).toBe('#d97757');
		expect(readBrand(rootEl)).toContain('--sp-brand-claude');

		// Swap to cursor — must update in place.
		providerStore.setResolved({ provider: 'cursor', mode: 'api' });
		await nextTick();
		expect(wrapper.find<HTMLElement>('[data-testid="agent-sidepanel"]').element).toBe(firstRef);
		const brandCursorLiteral = getComputedStyle(rootEl)
			.getPropertyValue('--sp-brand-cursor')
			.trim()
			.toLowerCase();
		expect(brandCursorLiteral).toBe('#6b7280'); // CQ-AUX-01 placeholder
		expect(readBrand(rootEl)).toContain('--sp-brand-cursor');

		wrapper.unmount();
	});
});
