/**
 * T-PV-006 (TEST-PV-002/003/060/061 + EC-PV-2/3/9) — RED: the pure/total resolve
 * helpers (SPEC-PV-003), ported from claudian `ProviderRegistry`
 * `getEnabledProviderIds:117-123` / `resolveSettingsProviderId:133-150` /
 * `resolveProviderForModel:152-183` with throw-paths converted to total returns:
 *   - `listEnabledProviders` — `isEnabled`-filtered, blank-tab-ordered fresh array;
 *     Claude always present (REQ-PV-006); claude+codex → [codex, claude] (15, 20).
 *   - `resolveActiveProvider` — recorded id if registered AND enabled, else 'claude'
 *     (no record / unknown / disabled → claude, EC-PV-2/3).
 *   - `resolveProviderForModel` — first `ownsModel` match, else the active/claude
 *     fallback (Codex-owned → codex; unowned → fallback, EC-PV-9).
 * All three pure + total — never throw.
 *
 * Fails until T-PV-007 adds `src/domain/chat/providers/resolveProvider.ts`.
 *
 * Traces: TEST-PV-002/003/060/061, SPEC-PV-003/029, REQ-PV-002/003/006/060/061,
 * NFR-PV-014, EC-PV-2/3/9.
 */
import { describe, it, expect } from 'vitest';
import {
	listEnabledProviders,
	resolveActiveProvider,
	resolveProviderForModel,
} from '@/domain/chat/providers/resolveProvider';
import {
	PROVIDER_DESCRIPTORS,
	CLAUDE_DESCRIPTOR,
} from '@/domain/chat/providers/ProviderDescriptor';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type { ProviderId } from '@/domain/chat/ProviderId';

const settings = (
	enabled: PluginSettings['enabledProviders'],
	active: ProviderId = 'claude',
): PluginSettings => ({
	...DEFAULT_SETTINGS,
	enabledProviders: enabled,
	activeProvider: active,
});

describe('listEnabledProviders (TEST-PV-002, REQ-PV-002/006)', () => {
	it('a single-Claude registry yields [claude]', () => {
		const result = listEnabledProviders(PROVIDER_DESCRIPTORS, settings([]));
		expect(result.map((d) => d.id)).toEqual(['claude']);
	});

	it('claude + codex enabled → blank-tab order [codex, claude] (15, 20)', () => {
		const result = listEnabledProviders(PROVIDER_DESCRIPTORS, settings(['codex']));
		expect(result.map((d) => d.id)).toEqual(['codex', 'claude']);
	});

	it('all three enabled → [opencode, codex, claude] (10, 15, 20)', () => {
		const result = listEnabledProviders(PROVIDER_DESCRIPTORS, settings(['codex', 'opencode']));
		expect(result.map((d) => d.id)).toEqual(['opencode', 'codex', 'claude']);
	});

	it('returns a FRESH array (no aliasing of the frozen table)', () => {
		const result = listEnabledProviders(PROVIDER_DESCRIPTORS, settings([]));
		expect(result).not.toBe(PROVIDER_DESCRIPTORS);
	});
});

describe('resolveActiveProvider (TEST-PV-003 + EC-PV-2/3, REQ-PV-003)', () => {
	it('no recorded selection (default claude) → claude', () => {
		expect(resolveActiveProvider(PROVIDER_DESCRIPTORS, DEFAULT_SETTINGS)).toBe('claude');
	});

	it('recorded + registered + enabled → the recorded id', () => {
		expect(resolveActiveProvider(PROVIDER_DESCRIPTORS, settings(['codex'], 'codex'))).toBe('codex');
	});

	it('recorded but DISABLED → claude fallback (EC-PV-3)', () => {
		// codex recorded active but NOT in enabledProviders → falls back to claude.
		expect(resolveActiveProvider(PROVIDER_DESCRIPTORS, settings([], 'codex'))).toBe('claude');
	});

	it('an empty registry still resolves to claude when claude is registered', () => {
		expect(resolveActiveProvider([CLAUDE_DESCRIPTOR], DEFAULT_SETTINGS)).toBe('claude');
	});
});

describe('resolveProviderForModel (TEST-PV-060/061 + EC-PV-9, REQ-PV-060/061)', () => {
	it('a Codex-owned model → codex', () => {
		expect(
			resolveProviderForModel(PROVIDER_DESCRIPTORS, 'gpt-5-codex', settings(['codex'], 'claude')),
		).toBe('codex');
	});

	it('an Opencode-owned model → opencode', () => {
		expect(
			resolveProviderForModel(
				PROVIDER_DESCRIPTORS,
				'opencode:anthropic/claude',
				settings(['opencode'], 'claude'),
			),
		).toBe('opencode');
	});

	it('a Claude-owned model → claude', () => {
		expect(resolveProviderForModel(PROVIDER_DESCRIPTORS, 'sonnet', DEFAULT_SETTINGS)).toBe('claude');
	});

	it('an unowned model → the active/claude fallback (EC-PV-9)', () => {
		expect(
			resolveProviderForModel(PROVIDER_DESCRIPTORS, 'totally-unowned-xyz', DEFAULT_SETTINGS),
		).toBe('claude');
	});
});

describe('resolve helpers are total — never throw', () => {
	it('odd inputs do not throw', () => {
		expect(() => listEnabledProviders(PROVIDER_DESCRIPTORS, DEFAULT_SETTINGS)).not.toThrow();
		expect(() => resolveActiveProvider([], DEFAULT_SETTINGS)).not.toThrow();
		expect(() => resolveProviderForModel(PROVIDER_DESCRIPTORS, '', DEFAULT_SETTINGS)).not.toThrow();
	});
});
