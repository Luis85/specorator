/**
 * T-CC-011 (TEST-CC-016) — RED: per-bridge `createChatRuntime()` factory.
 *
 * SPEC-CC-013 / ADR-CC-001 §6: each bridge exposes `createChatRuntime():
 * ChatRuntimePort` returning a **fresh** per-conversation instance —
 * `MockBridge` → `MockChatRuntime`, `LocalStorageBridge` → `FixtureChatRuntime`.
 * Two calls return distinct instances. Fails (RED) until T-CC-012 adds the
 * factory methods.
 *
 * The `ObsidianBridge` row (→ `ClaudeCliChatRuntime`) is covered structurally —
 * its runtime is coverage-excluded infra (manual TEST-CC-017), so it is not
 * instantiated here.
 *
 * > **Markdown render port (CLAR-CC-007 RESOLVED):** SPEC-CC-013 also wires a
 * > `safeMarkdownRender`-backed `MarkdownRenderPort` from each bridge. The
 * > `DELETED_SUBSYSTEM_BAN` was relaxed (CLAR-CC-007 resolved) to permit
 * > `@/application/chat/**` + `@/domain/ports/MarkdownRenderPort`, so this file
 * > now asserts both the runtime-factory leg AND the markdown-port leg of
 * > TEST-CC-016.
 *
 * Traces: TEST-CC-016, SPEC-CC-013, SPEC-CC-015, REQ-CC-014, ADR-CC-001 §6.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import { FixtureChatRuntime } from '@/infrastructure/localstorage/FixtureChatRuntime';

describe('createChatRuntime() factory (TEST-CC-016 runtime leg)', () => {
	it('MockBridge.createChatRuntime() returns a MockChatRuntime', () => {
		const bridge = new MockBridge();
		const runtime = bridge.createChatRuntime();
		expect(runtime).toBeInstanceOf(MockChatRuntime);
		expect(runtime.providerId).toBe('claude');
	});

	it('MockBridge.createChatRuntime() returns a fresh instance per call', () => {
		const bridge = new MockBridge();
		const a = bridge.createChatRuntime();
		const b = bridge.createChatRuntime();
		expect(a).not.toBe(b);
	});

	it('LocalStorageBridge.createChatRuntime() returns a FixtureChatRuntime', () => {
		const bridge = new LocalStorageBridge();
		const runtime = bridge.createChatRuntime();
		expect(runtime).toBeInstanceOf(FixtureChatRuntime);
		expect(runtime.providerId).toBe('claude');
	});

	it('LocalStorageBridge.createChatRuntime() returns a fresh instance per call', () => {
		const bridge = new LocalStorageBridge();
		const a = bridge.createChatRuntime();
		const b = bridge.createChatRuntime();
		expect(a).not.toBe(b);
	});
});

describe('createMarkdownRenderPort() (TEST-CC-016 markdown leg — CLAR-CC-007 resolved)', () => {
	it('MockBridge exposes a safeMarkdownRender-backed MarkdownRenderPort', () => {
		const port = new MockBridge().createMarkdownRenderPort();
		expect(typeof port.render).toBe('function');
		expect(port.render('hi `x`')).toEqual({
			nodes: [
				{
					kind: 'paragraph',
					spans: [
						{ kind: 'text', value: 'hi ' },
						{ kind: 'code', value: 'x' },
					],
				},
			],
		});
	});

	it('LocalStorageBridge exposes the markdown port with identical P1 behaviour', () => {
		const mockPort = new MockBridge().createMarkdownRenderPort();
		const localPort = new LocalStorageBridge().createMarkdownRenderPort();
		expect(localPort.render('one\n\ntwo')).toEqual(mockPort.render('one\n\ntwo'));
	});

	it('markdown port output holds no HTML for adversarial input (NFR-CC-008)', () => {
		const port = new MockBridge().createMarkdownRenderPort();
		const text = port
			.render('<script>x</script> & y')
			.nodes.flatMap((n) => n.spans.map((s) => s.value))
			.join(' ');
		expect(text).toContain('<script>');
		expect(text).not.toContain('&lt;');
	});
});
