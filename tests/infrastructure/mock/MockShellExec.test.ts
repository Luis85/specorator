/**
 * T-CP-008 (TEST-CP-028 Mock no-spawn leg) — RED: `MockBridge.shellExec.run` is a
 * scripted echo over a fixture `Map<command, ShellExecResult>` (default echoes the
 * command, `exitCode 0`); a fixture entry scripts a non-zero exit / a `truncated`
 * result; the Mock NEVER imports `child_process` / `node:*` (S1, asserted via the
 * source-level guard).
 *
 * Fails until T-CP-009 implements the scripted-echo ShellExec.
 *
 * Traces: TEST-CP-028 (Mock leg), SPEC-CP-009, REQ-CP-030/032, NFR-CP-006.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

describe('MockBridge.shellExec scripted echo (TEST-CP-028 Mock leg)', () => {
	it('default-echoes the command on stdout with exitCode 0', async () => {
		const result = await new MockBridge().shellExec.run({ command: 'echo hi' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.command).toBe('echo hi');
			expect(result.value.stdout).toContain('echo hi');
			expect(result.value.exitCode).toBe(0);
			expect(result.value.truncated).toBe(false);
		}
	});

	it('a scripted fixture entry returns a non-zero exit', async () => {
		const bridge = new MockBridge();
		bridge.seedShellExec('false', {
			command: 'false',
			stdout: '',
			stderr: 'failed',
			exitCode: 1,
			truncated: false,
		});
		const result = await bridge.shellExec.run({ command: 'false' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.exitCode).toBe(1);
	});

	it('a scripted fixture entry returns a truncated result', async () => {
		const bridge = new MockBridge();
		bridge.seedShellExec('huge', {
			command: 'huge',
			stdout: 'x'.repeat(10),
			stderr: '',
			exitCode: 124,
			truncated: true,
			notice: 'output exceeded 1MB',
		});
		const result = await bridge.shellExec.run({ command: 'huge' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.truncated).toBe(true);
			expect(result.value.exitCode).toBe(124);
		}
	});

	it('S1: the Mock bridge source imports no child_process / node:* shell', () => {
		const source = readFileSync(
			resolve(__dirname, '../../../src/infrastructure/mock/MockBridge.ts'),
			'utf8',
		);
		expect(source).not.toMatch(/child_process/);
		expect(source).not.toMatch(/from\s+['"]node:/);
	});
});
