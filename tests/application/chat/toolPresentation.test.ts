/**
 * TEST-RR-014 (U leg) — `toolPresentation` pure transform.
 *
 * SPEC-RR-014: `toolName`/`toolSummary`/`toolLabel` reproduce the per-tool
 * heuristics from claudian `getToolName`/`getToolSummary`/`getToolLabel`
 * (`ToolCallRenderer.ts:60/79/119`) + `fileNameOnly` (`:181`). Pure, total,
 * never-throwing: malformed/missing inputs degrade to `''` / `name`.
 *
 * Traces: TEST-RR-014, SPEC-RR-014, REQ-RR-019a/023, NFR-RR-003/005.
 */
import { describe, it, expect } from 'vitest';
import { toolName, toolSummary, toolLabel } from '@/application/chat/toolPresentation';

describe('toolPresentation — toolName (TEST-RR-014)', () => {
	it('TodoWrite -> "Tasks N/M" with completed/total counts', () => {
		const input = {
			todos: [
				{ content: 'a', activeForm: 'Aing', status: 'completed' },
				{ content: 'b', activeForm: 'Bing', status: 'in_progress' },
				{ content: 'c', activeForm: 'Cing', status: 'pending' },
			],
		};
		expect(toolName('TodoWrite', input)).toBe('Tasks 1/3');
	});

	it('TodoWrite with empty todos -> "Tasks"', () => {
		expect(toolName('TodoWrite', { todos: [] })).toBe('Tasks');
	});

	it('TodoWrite with absent todos -> "Tasks"', () => {
		expect(toolName('TodoWrite', {})).toBe('Tasks');
	});

	it('TodoWrite with all-invalid todos -> "Tasks"', () => {
		expect(toolName('TodoWrite', { todos: [{ nope: true }, 42, null] })).toBe('Tasks');
	});

	it('TodoWrite counts only valid completed items (guard-filtered)', () => {
		const input = {
			todos: [
				{ content: 'a', activeForm: 'Aing', status: 'completed' },
				{ content: '', activeForm: 'Bad', status: 'completed' }, // invalid -> dropped
				{ content: 'c', activeForm: 'Cing', status: 'completed' },
			],
		};
		expect(toolName('TodoWrite', input)).toBe('Tasks 2/2');
	});

	it('default tool -> name verbatim', () => {
		expect(toolName('Read', { file_path: '/x/y.ts' })).toBe('Read');
		expect(toolName('SomethingNew', {})).toBe('SomethingNew');
	});
});

describe('toolPresentation — toolSummary (TEST-RR-014)', () => {
	it('Read/Write/Edit -> fileNameOnly(file_path) last segment, backslash-normalised', () => {
		expect(toolSummary('Read', { file_path: '/a/b/c.ts' })).toBe('c.ts');
		expect(toolSummary('Write', { file_path: 'C:\\foo\\bar\\baz.md' })).toBe('baz.md');
		expect(toolSummary('Edit', { file_path: 'plain.txt' })).toBe('plain.txt');
	});

	it('Bash -> command truncated to <= 60 chars', () => {
		expect(toolSummary('Bash', { command: 'ls -la' })).toBe('ls -la');
		const long = 'x'.repeat(80);
		const out = toolSummary('Bash', { command: long });
		expect(out).toBe('x'.repeat(60) + '...');
		expect(out.length).toBe(63);
	});

	it('Glob/Grep -> pattern', () => {
		expect(toolSummary('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
		expect(toolSummary('Grep', { pattern: 'foo' })).toBe('foo');
	});

	it('LS -> fileNameOnly(path ?? ".")', () => {
		expect(toolSummary('LS', { path: '/a/b' })).toBe('b');
		expect(toolSummary('LS', {})).toBe('.');
	});

	it('TodoWrite -> "" (header carries the count)', () => {
		expect(toolSummary('TodoWrite', { todos: [] })).toBe('');
	});

	it('default tool -> ""', () => {
		expect(toolSummary('SomethingNew', { whatever: 1 })).toBe('');
	});

	it('missing/non-string inputs degrade to "" (never throws)', () => {
		expect(toolSummary('Read', {})).toBe('');
		expect(toolSummary('Bash', {})).toBe('');
		expect(toolSummary('Read', { file_path: 123 })).toBe('');
	});
});

describe('toolPresentation — toolLabel (TEST-RR-014)', () => {
	it('Read/Write/Edit -> "<Tool>: <shortPath>"', () => {
		expect(toolLabel('Read', { file_path: 'short.ts' })).toBe('Read: short.ts');
		expect(toolLabel('Read', { file_path: '/a/b/c/d/e.ts' })).toBe('Read: .../d/e.ts');
		expect(toolLabel('Write', { file_path: '' })).toBe('Write: file');
	});

	it('Bash -> "Bash: <cmd>" truncated to 40', () => {
		expect(toolLabel('Bash', { command: 'echo hi' })).toBe('Bash: echo hi');
		expect(toolLabel('Bash', {})).toBe('Bash: command');
		const long = 'y'.repeat(50);
		expect(toolLabel('Bash', { command: long })).toBe('Bash: ' + 'y'.repeat(40) + '...');
	});

	it('Glob/Grep -> "<Tool>: <pattern>"', () => {
		expect(toolLabel('Glob', { pattern: '*.md' })).toBe('Glob: *.md');
		expect(toolLabel('Glob', {})).toBe('Glob: files');
		expect(toolLabel('Grep', { pattern: 'x' })).toBe('Grep: x');
		expect(toolLabel('Grep', {})).toBe('Grep: pattern');
	});

	it('LS -> "LS: <shortPath || .>"', () => {
		expect(toolLabel('LS', { path: '/a/b' })).toBe('LS: /a/b');
		expect(toolLabel('LS', {})).toBe('LS: .');
	});

	it('TodoWrite -> "Tasks (N/M)" or "Tasks" when no todos', () => {
		const input = {
			todos: [
				{ content: 'a', activeForm: 'Aing', status: 'completed' },
				{ content: 'b', activeForm: 'Bing', status: 'pending' },
			],
		};
		expect(toolLabel('TodoWrite', input)).toBe('Tasks (1/2)');
		expect(toolLabel('TodoWrite', {})).toBe('Tasks');
	});

	it('default tool -> name', () => {
		expect(toolLabel('SomethingNew', {})).toBe('SomethingNew');
	});
});
