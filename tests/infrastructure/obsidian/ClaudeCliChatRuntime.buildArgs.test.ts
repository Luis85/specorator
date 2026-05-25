/**
 * R-CP-001 (RED) — the instruction `customSystemPrompt` must reach the CLI.
 *
 * `ClaudeCliChatRuntime._buildArgs` emits `--append-system-prompt <text>` when the
 * per-turn `ChatRuntimeQueryOptions.appendSystemPrompt` is present and non-empty
 * (the real `claude` CLI flag — the parity counterpart of Claudian feeding
 * `settings.systemPrompt` through `ClaudeQueryOptionsBuilder.buildSystemPrompt` into
 * the SDK). An empty / undefined value emits no flag. This is the testable seam of
 * the wire-up; the real round-trip rides manual TEST-CP-M2.
 *
 * `ClaudeCliChatRuntime` lives under `src/infrastructure/obsidian/**`
 * (coverage-excluded); only the pure argv assembly is asserted here — no subprocess
 * spawn. Traces: R-CP-001, SPEC-CP-011, REQ-CP-018.
 */
import { describe, it, expect } from 'vitest';
import { ClaudeCliChatRuntime } from '@/infrastructure/obsidian/ClaudeCliChatRuntime';
import type { ChatRuntimeQueryOptions } from '@/domain/ports';

/** Reach the private pure argv assembler (no spawn) — data-only assertion. */
function buildArgs(
	runtime: ClaudeCliChatRuntime,
	queryOptions?: ChatRuntimeQueryOptions,
): string[] {
	return (
		runtime as unknown as { _buildArgs(o?: ChatRuntimeQueryOptions): string[] }
	)._buildArgs(queryOptions);
}

describe('ClaudeCliChatRuntime._buildArgs — append-system-prompt (R-CP-001)', () => {
	it('emits --append-system-prompt <text> when appendSystemPrompt is present', () => {
		const runtime = new ClaudeCliChatRuntime();
		const argv = buildArgs(runtime, { appendSystemPrompt: 'Always answer in French.' });
		const idx = argv.indexOf('--append-system-prompt');
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(argv[idx + 1]).toBe('Always answer in French.');
	});

	it('emits no --append-system-prompt flag when appendSystemPrompt is empty', () => {
		const runtime = new ClaudeCliChatRuntime();
		expect(buildArgs(runtime, { appendSystemPrompt: '' })).not.toContain(
			'--append-system-prompt',
		);
	});

	it('emits no --append-system-prompt flag when appendSystemPrompt is absent', () => {
		const runtime = new ClaudeCliChatRuntime();
		expect(buildArgs(runtime, {})).not.toContain('--append-system-prompt');
		expect(buildArgs(runtime)).not.toContain('--append-system-prompt');
	});
});
