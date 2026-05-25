/**
 * T-TC-009 (RED) — LocalStorage inert toolbar impls (SPEC-TC-009, ADR-TC-003 §3).
 *
 * The GitHub Pages demo renders the full strip with the backed widgets + the honest
 * seams from a fixed inert posture:
 *   - `LocalStorageToolbarCatalog.getCatalog` → a fixed inert Claude-shaped catalog
 *     (a small model list + the mode + effort descriptors, NO service-tier),
 *     never throwing across the boundary;
 *   - `FixtureChatRuntime.getToolbarCapabilities()` → the inert flags
 *     (`supportsMcpTools:false`, `hasServiceTier:false`, `reasoningControl:'none'`,
 *     `hasModeToggle:true`, `permissionMode:'normal'` — P7 widens the P6 `'default'`,
 *     SPEC-AS-006b) so the demo shows the backed widgets + the honest-defer seams,
 *     never a live MCP/service-tier.
 * Both are exposed/wired through `LocalStorageBridge` (`get toolbarCatalog` +
 * `createChatRuntime().getToolbarCapabilities`).
 *
 * Fails until T-TC-011 supplies `@/infrastructure/localstorage/LocalStorageToolbarCatalog`
 * + `LocalStorageBridge.toolbarCatalog`.
 *
 * Traces: TEST-TC-019/021 (LS inert leg), SPEC-TC-009, REQ-TC-019/021, NFR-TC-002/010.
 */
import { describe, it, expect } from 'vitest';
import { LocalStorageToolbarCatalog } from '@/infrastructure/localstorage/LocalStorageToolbarCatalog';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import { FixtureChatRuntime } from '@/infrastructure/localstorage/FixtureChatRuntime';
import type { ToolbarCatalogPort } from '@/domain/ports';

describe('LocalStorageToolbarCatalog (TEST-TC-019/021 LS inert leg)', () => {
	it('is a ToolbarCatalogPort', () => {
		const port: ToolbarCatalogPort = new LocalStorageToolbarCatalog();
		expect(typeof port.getCatalog).toBe('function');
	});

	it('getCatalog returns a fixed inert Claude-shaped catalog (models + mode + effort, NO service-tier)', () => {
		const port = new LocalStorageToolbarCatalog();
		const catalog = port.getCatalog('claude');
		expect(catalog.models.length).toBeGreaterThan(0);
		expect(catalog.mode).toBeDefined();
		expect(catalog.reasoning?.control).toBe('effort');
		expect((catalog.reasoning?.options.length ?? 0) >= 2).toBe(true);
		expect(catalog.serviceTier).toBeUndefined();
	});

	it('never throws across the boundary (total)', () => {
		const port = new LocalStorageToolbarCatalog();
		expect(() => port.getCatalog('claude')).not.toThrow();
	});

	it('returns a stable catalog for repeated reads', () => {
		const port = new LocalStorageToolbarCatalog();
		expect(port.getCatalog('claude')).toEqual(port.getCatalog('claude'));
	});
});

describe('LocalStorageBridge.toolbarCatalog (TEST-TC-019/021 LS inert leg)', () => {
	it('exposes the inert ToolbarCatalogPort via the toolbarCatalog accessor', () => {
		const bridge = new LocalStorageBridge();
		const catalog = bridge.toolbarCatalog.getCatalog('claude');
		expect(catalog.models.length).toBeGreaterThan(0);
		expect(catalog.serviceTier).toBeUndefined();
	});
});

describe('FixtureChatRuntime.getToolbarCapabilities (TEST-TC-019/021 LS inert leg)', () => {
	it('reports the inert flags (all seams off, reasoning none)', () => {
		const runtime = new FixtureChatRuntime();
		expect(runtime.getToolbarCapabilities()).toEqual({
			supportsMcpTools: false,
			reasoningControl: 'none',
			hasServiceTier: false,
			hasModeToggle: true,
			// P7 (SPEC-AS-006b): the P6 `'default'` widens to the live `'normal'` (inert demo).
			permissionMode: 'normal',
		});
	});

	it('never throws (total)', () => {
		const runtime = new FixtureChatRuntime();
		expect(() => runtime.getToolbarCapabilities()).not.toThrow();
	});
});
