/**
 * T-PV-011 (RED) — the shared descriptor-table `ProviderRegistryPort` impl
 * (SPEC-PV-008). Over the frozen `PROVIDER_DESCRIPTORS` (SPEC-PV-002) + the pure
 * `resolveProvider` helpers (SPEC-PV-003): the registered/enabled lists, the
 * descriptor/display-name/capability reads, the active/model resolve delegation,
 * the no-`switch(providerId)` guard, and the never-throws assertion.
 *
 * Traces: TEST-PV-001/002/003/013/020/060/061; SPEC-PV-008/029; NFR-PV-014.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProviderRegistry } from '@/infrastructure/providers/ProviderRegistry';
import {
	PROVIDER_DESCRIPTORS,
	CLAUDE_DESCRIPTOR,
	CODEX_DESCRIPTOR,
	OPENCODE_DESCRIPTOR,
} from '@/domain/chat/providers';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';

function settings(partial: Partial<PluginSettings> = {}): PluginSettings {
	return { ...DEFAULT_SETTINGS, ...partial };
}

describe('ProviderRegistry (TEST-PV-001/002/003/013/020/060/061)', () => {
	const registry = new ProviderRegistry();

	it('listRegisteredProviders() returns the three frozen descriptors (TEST-PV-001)', () => {
		const registered = registry.listRegisteredProviders();
		expect(registered).toEqual(PROVIDER_DESCRIPTORS);
		expect(registered.map((d) => d.id)).toEqual(['claude', 'codex', 'opencode']);
	});

	it('listEnabledProviders() — Claude-only by default, claude always present (TEST-PV-002)', () => {
		const enabled = registry.listEnabledProviders(settings());
		expect(enabled.map((d) => d.id)).toEqual(['claude']);
	});

	it('listEnabledProviders() — blank-tab-ordered when codex enabled (TEST-PV-002)', () => {
		const enabled = registry.listEnabledProviders(settings({ enabledProviders: ['codex'] }));
		// order 15 (codex) before 20 (claude).
		expect(enabled.map((d) => d.id)).toEqual(['codex', 'claude']);
	});

	it('listEnabledProviders() — all three blank-tab-ordered (opencode 10, codex 15, claude 20)', () => {
		const enabled = registry.listEnabledProviders(
			settings({ enabledProviders: ['codex', 'opencode'] }),
		);
		expect(enabled.map((d) => d.id)).toEqual(['opencode', 'codex', 'claude']);
	});

	it('getDescriptor(id) returns the frozen descriptor (TEST-PV-013/020)', () => {
		expect(registry.getDescriptor('claude')).toBe(CLAUDE_DESCRIPTOR);
		expect(registry.getDescriptor('codex')).toBe(CODEX_DESCRIPTOR);
		expect(registry.getDescriptor('opencode')).toBe(OPENCODE_DESCRIPTOR);
	});

	it('getDisplayNameKey(id) returns the descriptor display-name key (TEST-PV-013)', () => {
		expect(registry.getDisplayNameKey('claude')).toBe(CLAUDE_DESCRIPTOR.displayNameKey);
		expect(registry.getDisplayNameKey('codex')).toBe(CODEX_DESCRIPTOR.displayNameKey);
	});

	it('getCapabilities(id) returns the frozen capability bag (TEST-PV-020)', () => {
		expect(registry.getCapabilities('codex')).toBe(CODEX_DESCRIPTOR.capabilities);
		expect(registry.getCapabilities('codex').supportsRewind).toBe(false);
		expect(registry.getCapabilities('codex').supportsTurnSteer).toBe(true);
		expect(registry.getCapabilities('opencode').supportsFork).toBe(false);
	});

	it('resolveActiveProvider() delegates to the pure helper (TEST-PV-003)', () => {
		// recorded codex but disabled → claude.
		expect(registry.resolveActiveProvider(settings({ activeProvider: 'codex' }))).toBe('claude');
		// recorded codex AND enabled → codex.
		expect(
			registry.resolveActiveProvider(
				settings({ activeProvider: 'codex', enabledProviders: ['codex'] }),
			),
		).toBe('codex');
		// no record → claude.
		expect(registry.resolveActiveProvider(settings())).toBe('claude');
	});

	it('resolveProviderForModel() delegates to the pure helper (TEST-PV-060/061)', () => {
		// a codex-owned model → codex (even when not the active provider).
		expect(registry.resolveProviderForModel('gpt-5', settings())).toBe('codex');
		// an opencode-owned model → opencode.
		expect(registry.resolveProviderForModel('opencode:grok', settings())).toBe('opencode');
		// an unowned model → the active/claude fallback.
		expect(registry.resolveProviderForModel('unknown-model', settings())).toBe('claude');
	});

	it('never throws across the reads (total)', () => {
		expect(() => {
			registry.listRegisteredProviders();
			registry.listEnabledProviders(settings());
			registry.getDescriptor('opencode');
			registry.getDisplayNameKey('opencode');
			registry.getCapabilities('opencode');
			registry.resolveActiveProvider(settings());
			registry.resolveProviderForModel('x', settings());
		}).not.toThrow();
	});

	it('contains no switch(providerId) / if (provider === …) branch (NFR-PV-014, TEST-PV-001/013)', () => {
		const source = readFileSync(
			resolve(__dirname, '../../../src/infrastructure/providers/ProviderRegistry.ts'),
			'utf8',
		);
		expect(source).not.toMatch(/switch\s*\(\s*\w*[Pp]rovider/);
		expect(source).not.toMatch(/===\s*['"]claude['"]/);
		expect(source).not.toMatch(/===\s*['"]codex['"]/);
		expect(source).not.toMatch(/===\s*['"]opencode['"]/);
	});
});
