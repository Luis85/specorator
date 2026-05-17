/**
 * Wiring tests for `AgentSidepanelView` — the dedicated single-purpose
 * sidepanel introduced by IDEA-ASV-001 (specs/agent-sidepanel-v2).
 *
 * Mirrors the structure of `SpecoratorView.test.ts` but against the new
 * `VIEW_TYPE_AGENT = 'specorator-agent'` view. Asserts the constructor wires
 * the transport selector correctly, `getActiveClaudeCliPort()` reflects the
 * selector's verdict, and `bumpSettingsVersion()` re-runs the selector
 * synchronously when no chat turn is in flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { toRaw } from 'vue';

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('obsidian');
	return {
		...actual,
		Platform: { isMobile: false },
		ItemView: class {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			constructor(public leaf: any) {}
		},
	};
});

import {
	AgentSidepanelView,
	type AgentSidepanelViewOptions,
	VIEW_TYPE_AGENT,
} from '@/plugin/AgentSidepanelView';
import { selectTransport } from '@/plugin/transport/TransportSelector';
import type {
	TransportSelection,
	TransportSelectorDeps,
} from '@/plugin/transport/TransportSelector';
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type {
	ClaudeCliPort,
	ClaudeCliStreamOptions,
	ConfirmModalPort,
	StreamDelta,
} from '@/domain/ports';
import type SpecoratorPlugin from '@/plugin/main';

function makePort(label: string): ClaudeCliPort {
	return {
		isAvailable: vi.fn(async () => true),
		queryStream: vi.fn(
			(_prompt: string, _options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta> => {
				return (async function* (): AsyncGenerator<StreamDelta> {
					yield { type: 'text', text: `from-${label}` };
					yield { type: 'done' };
				})();
			},
		),
	};
}

function makeSettings(overrides: Partial<PluginSettings>): PluginSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

interface Fixture {
	readonly sdkAdapter: ClaudeCliPort;
	readonly subscriptionAdapter: ClaudeCliPort;
	readonly degradedPort: ClaudeCliPort;
	readonly selectTransportSpy: ReturnType<typeof vi.fn>;
	readonly plugin: { settings: PluginSettings };
	readonly options: AgentSidepanelViewOptions;
	readonly cliResolvedRef: { value: boolean };
	readonly apiKeyPresentRef: { value: boolean };
	readonly confirmModalAdapter: ConfirmModalPort;
}

function makeConfirmModalAdapter(): ConfirmModalPort {
	return { show: vi.fn(async () => true) };
}

interface FixtureOptions {
	readonly transportKind?: PluginSettings['transportKind'];
	readonly apiKeyPresent?: boolean;
	readonly cliResolved?: boolean;
}

function makeFixture(opts: FixtureOptions = {}): Fixture {
	const sdkAdapter = makePort('sdk');
	const subscriptionAdapter = makePort('subscription');
	const degradedPort = degradedClaudeCliPort;
	const cliResolvedRef = { value: opts.cliResolved ?? false };
	const apiKeyPresentRef = { value: opts.apiKeyPresent ?? false };
	const confirmModalAdapter = makeConfirmModalAdapter();

	const selectTransportSpy = vi.fn((settings: PluginSettings): TransportSelection => {
		const deps: TransportSelectorDeps = {
			sdkAdapter,
			subscriptionAdapter,
			degradedPort,
			cliResolved: cliResolvedRef.value,
			apiKeyPresent: apiKeyPresentRef.value,
		};
		return selectTransport(settings, deps);
	});

	const plugin = {
		settings: makeSettings(opts.transportKind !== undefined ? { transportKind: opts.transportKind } : {}),
	};

	const options: AgentSidepanelViewOptions = {
		subscriptionAdapter,
		selectTransport: selectTransportSpy,
		confirmModalAdapter,
	};

	return {
		sdkAdapter,
		subscriptionAdapter,
		degradedPort,
		selectTransportSpy,
		plugin,
		options,
		cliResolvedRef,
		apiKeyPresentRef,
		confirmModalAdapter,
	};
}

function activePort(view: AgentSidepanelView): ClaudeCliPort {
	return toRaw(view.getActiveClaudeCliPort());
}

function makeView(fixture: Fixture, legacyPort?: ClaudeCliPort): AgentSidepanelView {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const leaf = {} as any;
	const port = legacyPort ?? fixture.sdkAdapter;
	return new AgentSidepanelView(
		leaf,
		fixture.plugin as unknown as SpecoratorPlugin,
		port,
		fixture.options,
	);
}

describe('AgentSidepanelView identity', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('exposes the canonical VIEW_TYPE_AGENT slug', () => {
		expect(VIEW_TYPE_AGENT).toBe('specorator-agent');
	});

	it('getViewType() returns the slug constant', () => {
		const view = makeView(makeFixture({ transportKind: 'auto' }));
		expect(view.getViewType()).toBe(VIEW_TYPE_AGENT);
	});

	it('getDisplayText() returns the sentence-cased title (matches the agent.title i18n key)', () => {
		const view = makeView(makeFixture({ transportKind: 'auto' }));
		expect(view.getDisplayText()).toBe('Specorator agent');
	});

	it('getIcon() returns a non-empty icon id', () => {
		const view = makeView(makeFixture({ transportKind: 'auto' }));
		expect(view.getIcon()).toBeTypeOf('string');
		expect(view.getIcon().length).toBeGreaterThan(0);
	});
});

describe('AgentSidepanelView transport wiring', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('passes plugin.settings to the selector at construction time', () => {
		const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: true, cliResolved: false });
		makeView(fixture);
		expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1);
		const callArg = fixture.selectTransportSpy.mock.calls[0][0] as PluginSettings;
		expect(callArg.transportKind).toBe('auto');
	});

	it('transportKind="api-key" + key present → resolves to sdkAdapter', () => {
		const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: true, cliResolved: false });
		const view = makeView(fixture);
		expect(activePort(view)).toBe(fixture.sdkAdapter);
	});

	it('transportKind="subscription" + cliResolved=true → resolves to subscriptionAdapter', () => {
		const fixture = makeFixture({ transportKind: 'subscription', apiKeyPresent: false, cliResolved: true });
		const view = makeView(fixture);
		expect(activePort(view)).toBe(fixture.subscriptionAdapter);
	});

	it('fully degraded (auto + empty key + cliResolved=false) → resolves to degradedPort', () => {
		const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false });
		const view = makeView(fixture);
		expect(activePort(view)).toBe(fixture.degradedPort);
	});

	it('getActiveTransportKind() mirrors the selector verdict', () => {
		const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: true, cliResolved: false });
		const view = makeView(fixture);
		expect(view.getActiveTransportKind()).toBe('api-key');
	});
});

describe('AgentSidepanelView.bumpSettingsVersion()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('re-runs the selector when called', () => {
		const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: true, cliResolved: false });
		const view = makeView(fixture);
		expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1);
		view.bumpSettingsVersion();
		// One extra call from `_applyTransportRefresh()` (plus the call from
		// `_refreshActivePort()` which runs unconditionally inside it).
		expect(fixture.selectTransportSpy.mock.calls.length).toBeGreaterThan(1);
	});

	it('reflects a transport change made between two bumpSettingsVersion calls', () => {
		const fixture = makeFixture({ transportKind: 'subscription', apiKeyPresent: false, cliResolved: false });
		const view = makeView(fixture);
		// At construction cliResolved=false → degraded
		expect(activePort(view)).toBe(fixture.degradedPort);
		// Flip the world: CLI now resolved
		fixture.cliResolvedRef.value = true;
		view.bumpSettingsVersion();
		expect(activePort(view)).toBe(fixture.subscriptionAdapter);
	});
});
