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
 * > **Markdown render port (deferred):** SPEC-CC-013 also wires a
 * > `safeMarkdownRender`-backed `MarkdownRenderPort` from each bridge. That leg
 * > is blocked by the active `DELETED_SUBSYSTEM_BAN` (eslint.config.js bans
 * > `@/application/chat/**` + `@/domain/ports/MarkdownRenderPort`) and is handed
 * > back to architect/pm via workflow-state.md (CLAR-CC-007). This file asserts
 * > only the runtime factory leg of TEST-CC-016.
 *
 * Traces: TEST-CC-016, SPEC-CC-013, REQ-CC-014, ADR-CC-001 §6.
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
