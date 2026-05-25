/**
 * T-TC-009 (RED) — scriptable Mock `ToolbarCatalogPort` (SPEC-TC-008, ADR-TC-004 §1).
 *
 * The scriptable Mock catalog the view-model + widget tests inject instead of a real
 * provider:
 *   - default `getCatalog('claude')` → a small Claude-shaped catalog (a non-empty
 *     model list + a mode descriptor + an effort `ReasoningDescriptor`; no
 *     service-tier);
 *   - `setToolbarCatalog(catalog)` → `getCatalog` returns the injected `ToolbarCatalog`
 *     so the tests drive every shape (custom models, grouped models, effort vs
 *     token-budget reasoning, with/without a mode descriptor, with/without a
 *     service-tier descriptor, an EMPTY model list for the degrade path);
 *   - total — never throws across the boundary (NFR-TC-010), the result is stable for
 *     repeated reads of the same scripted catalog.
 * It is exposed on `MockBridge` via a `get toolbarCatalog` accessor mirroring `auxModel`.
 *
 * Fails until T-TC-010 supplies `@/infrastructure/mock/MockToolbarCatalog` +
 * `MockBridge.toolbarCatalog`.
 *
 * Traces: TEST-TC-003 (Mock backing), TEST-TC-010 (Mock/empty-list backing),
 * TEST-TC-013/017/019 (Mock backing), TEST-TC-030 (catalog-miss-degrades backing),
 * SPEC-TC-008, SPEC-TC-004, REQ-TC-003/013/019, NFR-TC-001/010.
 */
import { describe, it, expect } from 'vitest';
import { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ToolbarCatalogPort, ToolbarCatalog } from '@/domain/ports';

describe('MockToolbarCatalog (TEST-TC-003/010 Mock backing)', () => {
	it('is a ToolbarCatalogPort', () => {
		const catalog: ToolbarCatalogPort = new MockToolbarCatalog();
		expect(typeof catalog.getCatalog).toBe('function');
	});

	it('default getCatalog(claude) returns a small Claude-shaped catalog (models + mode + effort reasoning, no service-tier)', () => {
		const port = new MockToolbarCatalog();
		const catalog = port.getCatalog('claude');
		expect(catalog.models.length).toBeGreaterThan(0);
		expect(catalog.defaultModelId).toBeDefined();
		expect(catalog.mode).toBeDefined();
		expect(catalog.reasoning?.control).toBe('effort');
		expect((catalog.reasoning?.options.length ?? 0) >= 2).toBe(true);
		expect(catalog.serviceTier).toBeUndefined();
	});

	it('setToolbarCatalog overrides getCatalog with the injected catalog (custom + grouped models)', () => {
		const port = new MockToolbarCatalog();
		const injected: ToolbarCatalog = {
			models: [
				{ id: 'a', label: 'Model A', group: 'Recent' },
				{ id: 'b', label: 'Model B', group: 'All' },
			],
			defaultModelId: 'a',
		};
		port.setToolbarCatalog(injected);
		expect(port.getCatalog('claude')).toEqual(injected);
	});

	it('setToolbarCatalog can inject a token-budget reasoning descriptor', () => {
		const port = new MockToolbarCatalog();
		const injected: ToolbarCatalog = {
			models: [{ id: 'a', label: 'A' }],
			reasoning: {
				control: 'token-budget',
				options: [
					{ kind: 'budget', tokens: 1024 },
					{ kind: 'budget', tokens: 4096 },
				],
			},
		};
		port.setToolbarCatalog(injected);
		expect(port.getCatalog('claude').reasoning?.control).toBe('token-budget');
	});

	it('setToolbarCatalog can inject a service-tier descriptor', () => {
		const port = new MockToolbarCatalog();
		const injected: ToolbarCatalog = {
			models: [{ id: 'a', label: 'A' }],
			serviceTier: { activeValue: 'fast', inactiveValue: 'standard', label: 'Fast' },
		};
		port.setToolbarCatalog(injected);
		expect(port.getCatalog('claude').serviceTier?.activeValue).toBe('fast');
	});

	it('setToolbarCatalog can inject an EMPTY model list for the degrade path (EC-TC-3)', () => {
		const port = new MockToolbarCatalog();
		port.setToolbarCatalog({ models: [] });
		expect(port.getCatalog('claude').models).toEqual([]);
	});

	it('setToolbarCatalog can omit the mode descriptor (mode-hidden path)', () => {
		const port = new MockToolbarCatalog();
		port.setToolbarCatalog({ models: [{ id: 'a', label: 'A' }] });
		expect(port.getCatalog('claude').mode).toBeUndefined();
	});

	it('getCatalog is stable across repeated reads of the same scripted catalog', () => {
		const port = new MockToolbarCatalog();
		const injected: ToolbarCatalog = { models: [{ id: 'a', label: 'A' }], defaultModelId: 'a' };
		port.setToolbarCatalog(injected);
		expect(port.getCatalog('claude')).toEqual(port.getCatalog('claude'));
	});

	it('never throws across the boundary (total) — default read is safe', () => {
		const port = new MockToolbarCatalog();
		expect(() => port.getCatalog('claude')).not.toThrow();
	});
});

describe('MockBridge.toolbarCatalog (TEST-TC-003 Mock backing)', () => {
	it('exposes a scriptable ToolbarCatalogPort via the toolbarCatalog accessor', () => {
		const bridge = new MockBridge();
		expect(typeof bridge.toolbarCatalog.getCatalog).toBe('function');
		bridge.toolbarCatalog.setToolbarCatalog({ models: [{ id: 'z', label: 'Z' }] });
		expect(bridge.toolbarCatalog.getCatalog('claude').models).toEqual([{ id: 'z', label: 'Z' }]);
	});

	it('returns the same stable instance across reads (the bridge IS the port)', () => {
		const bridge = new MockBridge();
		expect(bridge.toolbarCatalog).toBe(bridge.toolbarCatalog);
	});
});
