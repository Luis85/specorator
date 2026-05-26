/**
 * T-AS-013 (RED) — scriptable `MockChatRuntime` permission-mode (SPEC-AS-008).
 *
 * The Mock runtime gains a P7 mode seam so the approval/toolbar tests drive a mode
 * without a real provider:
 *   - it records the `queryOptions.permissionMode` of the last `query` so a test asserts
 *     the folded mode reaches the runtime (`getLastPermissionMode()`, TEST-AS-002);
 *   - `setToolbarCapabilities` already drives `getToolbarCapabilities().permissionMode`
 *     so the toggle/panel reflect a driven mode (TEST-AS-003/006/040) — this asserts the
 *     three-mode representability after the T-AS-011 widen.
 *
 * Fails until T-AS-014 adds the `getLastPermissionMode` accessor + the recording in
 * `MockChatRuntime.query`.
 *
 * Traces: TEST-AS-002 (Mock backing), TEST-AS-003/006/040 (Mock mode backing),
 * SPEC-AS-008, REQ-AS-002/006, NFR-AS-010.
 */
import { describe, it, expect } from 'vitest';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { PreparedChatTurn } from '@/domain/ports';

function turn(text = 'hi'): PreparedChatTurn {
	return {
		request: { text },
		persistedContent: text,
		prompt: text,
		isCompact: false,
		mcpMentions: new Set<string>(),
	};
}

async function drain(runtime: MockChatRuntime, mode?: 'normal' | 'plan' | 'yolo'): Promise<void> {
	const gen = runtime.query(turn(), undefined, mode !== undefined ? { permissionMode: mode } : {});
	for await (const chunk of gen) {
		void chunk; // drain to completion so the query records the mode
	}
}

describe('MockChatRuntime permission-mode (TEST-AS-002 Mock backing)', () => {
	it('records the last query permissionMode (the folded mode reaches the runtime)', async () => {
		const runtime = new MockChatRuntime([{ type: 'text', content: 'ok' }]);
		await drain(runtime, 'yolo');
		expect(runtime.getLastPermissionMode()).toBe('yolo');
	});

	it('a P6-shaped query (no permissionMode) records undefined (byte-identical send path)', async () => {
		const runtime = new MockChatRuntime([{ type: 'text', content: 'ok' }]);
		await drain(runtime);
		expect(runtime.getLastPermissionMode()).toBeUndefined();
	});

	it('the recorded mode reflects the most recent query', async () => {
		const runtime = new MockChatRuntime([{ type: 'text', content: 'ok' }]);
		await drain(runtime, 'plan');
		await drain(runtime, 'normal');
		expect(runtime.getLastPermissionMode()).toBe('normal');
	});
});

describe('MockChatRuntime scriptable toolbar permissionMode (TEST-AS-003/006/040 Mock backing)', () => {
	it('defaults to normal after the T-AS-011 widen', () => {
		const runtime = new MockChatRuntime();
		expect(runtime.getToolbarCapabilities().permissionMode).toBe('normal');
	});

	it('setToolbarCapabilities drives a plan / yolo mode (three-mode representable)', () => {
		const runtime = new MockChatRuntime();
		runtime.setToolbarCapabilities({
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'plan',
		});
		expect(runtime.getToolbarCapabilities().permissionMode).toBe('plan');
		runtime.setToolbarCapabilities({
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'yolo',
		});
		expect(runtime.getToolbarCapabilities().permissionMode).toBe('yolo');
	});
});
