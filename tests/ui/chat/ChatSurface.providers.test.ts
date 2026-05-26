/**
 * T-PV-034 (RED) — `ChatSurface.vue` P9 provider-registry wiring
 * (TEST-PV-010/012/062/084/114 surface legs + the TEST-PV-112 wiring leg).
 *
 * SPEC-PV-020/031/034. The surface injects `PROVIDER_REGISTRY_PORT` OPTIONALLY
 * (absent → no chooser, the active provider defaults to `'claude'`, byte-identical
 * P8). With the port + `SETTINGS_PORT`:
 *   (a) it resolves the active provider via `registry.resolveActiveProvider(settings)`
 *       and passes it to the widened `CHAT_RUNTIME_FACTORY(providerId)` per tab
 *       (TEST-PV-010/012);
 *   (b) it mounts the `ProviderChooser` driven by `buildProviderViewModel` — hidden at
 *       ≤ 1 enabled (byte-identical P8, EC-PV-1), listing the enabled providers in
 *       blank-tab order at > 1 enabled (TEST-PV-006);
 *   (c) selecting a provider routes through `SelectProviderUseCase.select` → the factory
 *       is called with the selected id (TEST-PV-012);
 *   (d) the toolbar reads `getCatalog(activeProvider)`, NOT a hard-coded `'claude'`
 *       (TEST-PV-062);
 *   (e) a Claude-only configuration provides exactly the P8 values → byte-identical
 *       (SPEC-PV-027, TEST-PV-114).
 *
 * RED because the production provide + the resolved-provider routing + the chooser
 * mount do not yet exist (the surface still hard-codes `'claude'` for the factory + the
 * catalog and never mounts the chooser). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-PV-010/012/062/084/114, SPEC-PV-020/031/034, NFR-PV-001.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import { i18n } from '@/ui/i18n';
import {
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	PROVIDER_HISTORY_PORT,
	ICON_PORT,
	TOOLBAR_CATALOG_PORT,
	SETTINGS_PORT,
	PROVIDER_REGISTRY_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { ok } from '@/domain/shared/Result';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { ProviderRegistry } from '@/infrastructure/providers/ProviderRegistry';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type {
	NotificationPort,
	LoggerPort,
	SettingsPort,
	ToolbarCatalog,
	ToolbarCatalogPort,
} from '@/domain/ports';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { Result } from '@/domain/shared/Result';
import type { ChatRuntimePort } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

const iconBridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

type RecordingSettings = SettingsPort & { readonly current: PluginSettings };
type RecordingCatalog = ToolbarCatalogPort & { readonly lastProviderId: ProviderId | null };

/** A SettingsPort backed by an in-memory blob (records the last saved settings). */
function fakeSettings(initial: PluginSettings): RecordingSettings {
	const state = { current: { ...initial } };
	return {
		getSettings: () => Promise.resolve(state.current),
		saveSettings: (next: PluginSettings) => {
			state.current = next;
			return Promise.resolve();
		},
		get current() {
			return state.current;
		},
	};
}

/** A catalog that records the providerId passed to `getCatalog`. */
function recordingCatalog(): RecordingCatalog {
	const seen: { lastProviderId: ProviderId | null } = { lastProviderId: null };
	const empty: ToolbarCatalog = { models: [] };
	return {
		getCatalog(providerId: ProviderId): ToolbarCatalog {
			seen.lastProviderId = providerId;
			return empty;
		},
		get lastProviderId() {
			return seen.lastProviderId;
		},
	};
}

interface MountOptions {
	settings?: PluginSettings;
	factory?: (providerId: ProviderId) => Result<ChatRuntimePort>;
	catalog?: ToolbarCatalogPort;
	withRegistry?: boolean;
}

function mountSurface(options: MountOptions = {}) {
	const settings = options.settings ?? { ...DEFAULT_SETTINGS };
	const settingsPort = fakeSettings(settings);
	const factory = options.factory ?? ((): Result<ChatRuntimePort> => ok(new MockChatRuntime([])));
	const provide: Record<symbol, unknown> = {
		[CHAT_RUNTIME_FACTORY as symbol]: factory,
		[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
		[NOTIFICATION_PORT as symbol]: notifySpy(),
		[LOGGER_PORT as symbol]: logger,
		[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
		[ICON_PORT as symbol]: iconBridge.createIconPort(),
		[SETTINGS_PORT as symbol]: settingsPort,
	};
	if (options.catalog !== undefined) provide[TOOLBAR_CATALOG_PORT as symbol] = options.catalog;
	if (options.withRegistry !== false) provide[PROVIDER_REGISTRY_PORT as symbol] = new ProviderRegistry();
	const wrapper = mount(ChatSurface, { global: { plugins: [i18n], provide } });
	return { wrapper, po: new ChatSurfacePageObject(wrapper), settingsPort };
}

describe('ChatSurface P9 provider-registry wiring (SPEC-PV-020)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('EC-PV-1: a single-Claude configuration mounts NO chooser (byte-identical P8)', async () => {
		const { po } = mountSurface({ settings: { ...DEFAULT_SETTINGS, enabledProviders: [] } });
		await flushPromises();
		await nextTick();
		expect(po.exists()).toBe(true);
		expect(po.providerAttr()).toBe('claude');
		expect(po.hasProviderChooser()).toBe(false);
	});

	it('TEST-PV-006: with > 1 enabled provider the chooser lists them in blank-tab order', async () => {
		const { po } = mountSurface({
			settings: { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] },
		});
		await flushPromises();
		await nextTick();
		expect(po.hasProviderChooser()).toBe(true);
		// blank-tab order ascending: codex (15) then claude (20).
		expect(po.providerOptionIds()).toEqual(['codex', 'claude']);
	});

	it('TEST-PV-114: with no PROVIDER_REGISTRY_PORT the surface stays byte-identical P8 (no chooser)', async () => {
		const { po } = mountSurface({ withRegistry: false });
		await flushPromises();
		await nextTick();
		expect(po.exists()).toBe(true);
		expect(po.hasProviderChooser()).toBe(false);
	});

	it('TEST-PV-010: the per-tab runtime is built via the factory with the resolved active provider', async () => {
		const factory = vi.fn((): Result<ChatRuntimePort> => ok(new MockChatRuntime([])));
		mountSurface({
			settings: { ...DEFAULT_SETTINGS, enabledProviders: ['codex'], activeProvider: 'codex' },
			factory,
		});
		await flushPromises();
		await nextTick();
		// The resolved active provider (codex, enabled + recorded) reaches the factory.
		expect(factory).toHaveBeenCalledWith('codex');
	});

	it('TEST-PV-012: selecting a provider routes through SelectProviderUseCase → the factory is re-called with the selected id', async () => {
		const factory = vi.fn((): Result<ChatRuntimePort> => ok(new MockChatRuntime([])));
		const { po, settingsPort } = mountSurface({
			settings: { ...DEFAULT_SETTINGS, enabledProviders: ['codex'] },
			factory,
		});
		await flushPromises();
		await nextTick();
		await po.selectProvider('codex');
		await flushPromises();
		await nextTick();
		// The selection persists device-local + reconstructs the runtime for the new provider.
		expect(settingsPort.current.activeProvider).toBe('codex');
		expect(factory).toHaveBeenCalledWith('codex');
	});

	it('TEST-PV-062: the toolbar reads getCatalog(activeProvider), not a hard-coded claude', async () => {
		const catalog = recordingCatalog();
		mountSurface({
			settings: { ...DEFAULT_SETTINGS, enabledProviders: ['codex'], activeProvider: 'codex' },
			catalog,
		});
		await flushPromises();
		await nextTick();
		expect(catalog.lastProviderId).toBe('codex');
	});
});
