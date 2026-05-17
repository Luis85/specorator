/**
 * Narrow port (ADR-008) for the streaming-transport lifecycle. Owns the two
 * stateful side-effects that are *not* part of the per-turn streaming
 * surface in `ClaudeCliPort`:
 *
 *   - `startup()` — pre-warm the underlying transport (SDK adapter resolves
 *     the binary path; subscription adapter resolves the user-configured
 *     `claude` binary).  Idempotent.  Never throws.
 *   - `shutdown()` — synchronously tear down any in-flight subprocesses
 *     before plugin unload.  Synchronous so it can run inside Obsidian's
 *     `onunload()` register hook.  Never throws.
 *
 * Split off `ClaudeCliPort` in WP-12 (Arch review #3): the per-turn
 * `queryStream` / `runStructured` surface has nothing to do with process
 * lifecycle, and there is exactly one production caller per method
 * (`AgentSidepanelView` / `SpecoratorView` startup; `main.ts` `register()`
 * shutdown). Per ADR-008's *one responsibility per port* spirit, lifecycle
 * is its own port — even though splitting it grows the file count from
 * one to two.
 *
 * Three concrete implementations:
 *   - `ClaudeCliAdapter`        — SDK transport, pre-warms the SDK binary.
 *   - `ClaudeSubprocessAdapter` — subscription transport, resolves the user's
 *                                 `claude` binary and tracks active children.
 *   - `MockClaudeCliPort` / `MockClaudeSubprocessAdapter` — no-op stubs.
 *
 * Test fixtures and the standalone-web `LocalStorageBridge` deliberately
 * do not satisfy this port: those surfaces never start a real transport, so
 * they do not need lifecycle wiring.
 */
export interface TransportLifecyclePort {
	/**
	 * Pre-warm the transport. Called from `onLayoutReady()` before the first
	 * user interaction. Must not throw — log errors internally and return.
	 * Satisfies REQ-CCS-003, NFR-CCS-002, NFR-ASM-006.
	 */
	startup(): Promise<void>;

	/**
	 * Terminate any in-flight subprocesses. Called from `onunload()` which is
	 * synchronous. Must be synchronous (fire-and-forget is acceptable) and
	 * must not throw.
	 * Satisfies REQ-CCS-017, NFR-CCS-007.
	 */
	shutdown(): void;
}
