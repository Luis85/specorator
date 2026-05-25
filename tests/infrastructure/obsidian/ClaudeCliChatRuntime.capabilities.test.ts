/**
 * R-TS-002 / ADR-TS-004 (RED) — the Claude subprocess-CLI runtime cannot
 * faithfully rewind-to-turn (that is an Agent-SDK-transport capability), so it
 * reports `supportsRewind: false`. `supportsFork` stays `true` (fork derives
 * lineage via `--resume <forkSource.sessionId>`, ADR-TS-001 §1).
 *
 * `ClaudeCliChatRuntime` lives under `src/infrastructure/obsidian/**`
 * (coverage-excluded); only its capability *value* is asserted here — pure data,
 * no subprocess spawn. This is the ADR-TS-004 §Compliance check that
 * `getCapabilities().supportsRewind === false` (+ fork true).
 *
 * Traces: ADR-TS-004 (Option B1), SPEC-TS-003/009/025, REQ-TS-019/021/026/027.
 */
import { describe, it, expect } from 'vitest';
import { ClaudeCliChatRuntime } from '@/infrastructure/obsidian/ClaudeCliChatRuntime';

describe('ClaudeCliChatRuntime capabilities (ADR-TS-004)', () => {
	it('R-TS-002: reports supportsRewind=false (rewind-to-turn is SDK-transport, not raw --print)', () => {
		const runtime = new ClaudeCliChatRuntime();
		expect(runtime.getCapabilities().supportsRewind).toBe(false);
	});

	it('keeps supportsFork=true (fork derives lineage via --resume, not resume-at)', () => {
		const runtime = new ClaudeCliChatRuntime();
		expect(runtime.getCapabilities().supportsFork).toBe(true);
	});

	it('setResumeCheckpoint is a no-op-by-transport: it does not throw (port contract retained)', () => {
		const runtime = new ClaudeCliChatRuntime();
		// The port member stays callable (ADR-TS-002 §3) but does nothing on this
		// transport — no checkpoint state is applied (ADR-TS-004 §Decision 2).
		expect(() => {
			runtime.setResumeCheckpoint('assistant-uuid');
		}).not.toThrow();
	});
});
