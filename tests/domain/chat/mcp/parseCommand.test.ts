/**
 * T-MC-008 (TEST-MC-020a + EC-MC-7) — RED: the PURE, TOTAL `parseCommand` /
 * `splitCommandString` — the no-shell quote-aware stdio command tokeniser. Ported
 * verbatim from claudian `utils/mcp.ts:46/59`; no shell, no eval (REQ-MC-061).
 *
 * Fails until T-MC-009 adds `src/domain/chat/mcp/parseCommand.ts`.
 *
 * Traces: TEST-MC-020a, SPEC-MC-005, REQ-MC-020/023/061, NFR-MC-002/004, EC-MC-7.
 */
import { describe, it, expect } from 'vitest';
import { parseCommand, splitCommandString } from '@/domain/chat/mcp';

describe('parseCommand (TEST-MC-020a)', () => {
	it('returns { cmd: command, args: providedArgs } when providedArgs is non-empty', () => {
		expect(parseCommand('npx', ['-y', 'pkg'])).toEqual({ cmd: 'npx', args: ['-y', 'pkg'] });
	});

	it('splits the command string when providedArgs is empty/absent', () => {
		expect(parseCommand('npx -y server-filesystem')).toEqual({
			cmd: 'npx',
			args: ['-y', 'server-filesystem'],
		});
	});

	it('an empty providedArgs falls back to splitting the command', () => {
		expect(parseCommand('node script.js', [])).toEqual({ cmd: 'node', args: ['script.js'] });
	});

	it('parseCommand("", undefined) → { cmd:"", args:[] } (EC-MC-7)', () => {
		expect(parseCommand('', undefined)).toEqual({ cmd: '', args: [] });
	});

	it('a whitespace-only command → { cmd:"", args:[] }', () => {
		expect(parseCommand('   ')).toEqual({ cmd: '', args: [] });
	});
});

describe('splitCommandString — quote-aware, no shell (TEST-MC-020a, EC-MC-7)', () => {
	it('splits on unquoted whitespace', () => {
		expect(splitCommandString('a b c')).toEqual(['a', 'b', 'c']);
	});

	it('groups a run inside double quotes (quotes stripped)', () => {
		expect(splitCommandString('cmd "hello world" tail')).toEqual(['cmd', 'hello world', 'tail']);
	});

	it('groups a run inside single quotes (quotes stripped)', () => {
		expect(splitCommandString("cmd 'a b' c")).toEqual(['cmd', 'a b', 'c']);
	});

	it('collapses multiple unquoted spaces', () => {
		expect(splitCommandString('a   b')).toEqual(['a', 'b']);
	});

	it('an empty string → []', () => {
		expect(splitCommandString('')).toEqual([]);
	});

	it('never throws on odd input (NFR-MC-004)', () => {
		for (const s of ['', '  ', '"unterminated', "'also", 'a"b"c']) {
			expect(() => splitCommandString(s)).not.toThrow();
		}
	});
});
