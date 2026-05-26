/**
 * T-TC-009 (RED) — scriptable Mock `getToolbarCapabilities` (SPEC-TC-008, ADR-TC-003 §2).
 *
 * The Mock runtime's `getToolbarCapabilities()` is scriptable so the view-model +
 * widget tests drive the seam-hidden-vs-visible matrix:
 *   - default → Claude-shaped (`supportsMcpTools:false`, `reasoningControl:'effort'`,
 *     `hasServiceTier:false`, `hasModeToggle:true`, `permissionMode:'normal'` — P7
 *     widens the P6 `'default'` to the live `'normal'`, SPEC-AS-006b);
 *   - `setToolbarCapabilities(caps)` overrides the returned flags (drives
 *     `supportsMcpTools` true/false, `hasServiceTier` true/false, `reasoningControl`
 *     effort/token-budget/none, `permissionMode` normal/plan/yolo);
 *   - synchronous + total — never throws.
 *
 * Fails until T-TC-010 adds `MockChatRuntime.setToolbarCapabilities` (replacing the
 * T-TC-008 fixed stub).
 *
 * Traces: TEST-TC-003/019/021 (Mock backing), SPEC-TC-008, SPEC-TC-005,
 * REQ-TC-003/019/021, NFR-TC-001/010.
 */
import { describe, it, expect } from 'vitest';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { ToolbarCapabilities } from '@/domain/ports';

describe('MockChatRuntime.getToolbarCapabilities (scriptable, TEST-TC-003/019/021 Mock backing)', () => {
	it('defaults to the Claude-shaped flags', () => {
		const runtime = new MockChatRuntime();
		expect(runtime.getToolbarCapabilities()).toEqual({
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			// P7 (SPEC-AS-006b): the P6 `'default'` default maps to the live `'normal'`.
			permissionMode: 'normal',
		});
	});

	it('setToolbarCapabilities overrides the returned flags (seam-visible matrix)', () => {
		const runtime = new MockChatRuntime();
		const caps: ToolbarCapabilities = {
			supportsMcpTools: true,
			reasoningControl: 'token-budget',
			hasServiceTier: true,
			hasModeToggle: false,
			permissionMode: 'plan',
		};
		runtime.setToolbarCapabilities(caps);
		expect(runtime.getToolbarCapabilities()).toEqual(caps);
	});

	it('setToolbarCapabilities can drive the reasoning-none (thinking-hidden) seam', () => {
		const runtime = new MockChatRuntime();
		runtime.setToolbarCapabilities({
			supportsMcpTools: false,
			reasoningControl: 'none',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'normal',
		});
		expect(runtime.getToolbarCapabilities().reasoningControl).toBe('none');
	});

	it('is synchronous + total — never throws', () => {
		const runtime = new MockChatRuntime();
		expect(() => runtime.getToolbarCapabilities()).not.toThrow();
	});
});
