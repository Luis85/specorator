/**
 * T-AS-004 (TEST-AS-010/011/012/013/014/015 + EC-AS-7/8/9) — RED: the PURE matcher
 * `getActionPattern` / `getActionDescription` / `matchesRulePattern`
 * (`@/domain/chat/approvals/ApprovalMatcher`). Ported verbatim from claudian-main
 * `core/security/ApprovalManager.ts`. The full SPEC-AS-026 truth table — bash
 * exact-or-explicit-wildcard ONLY, file path-segment-boundary prefix, other-tool
 * simple prefix, the null-action guard, `\`→`/` normalise — plus the per-tool
 * `getActionPattern`/`getActionDescription` tables, and the never-throws assertion
 * (NFR-AS-009, the functions are pure + total).
 *
 * Fails until T-AS-005 creates `ApprovalMatcher.ts` + the barrel re-export.
 *
 * Traces: TEST-AS-010/011/012/013/014/015, SPEC-AS-004, SPEC-AS-026,
 * REQ-AS-010..015, NFR-AS-009, EC-AS-7/8/9.
 */
import { describe, it, expect } from 'vitest';
import {
	getActionPattern,
	getActionDescription,
	matchesRulePattern,
} from '@/domain/chat/approvals/ApprovalMatcher';

describe('getActionPattern (TEST-AS-010)', () => {
	it('Bash → trimmed command (or empty string when absent)', () => {
		expect(getActionPattern('Bash', { command: '  git status  ' })).toBe('git status');
		expect(getActionPattern('Bash', {})).toBe('');
		expect(getActionPattern('Bash', { command: 42 })).toBe('');
	});

	it('Read/Write/Edit → file_path or null', () => {
		expect(getActionPattern('Read', { file_path: '/a/b.md' })).toBe('/a/b.md');
		expect(getActionPattern('Write', { file_path: '/a/b.md' })).toBe('/a/b.md');
		expect(getActionPattern('Edit', { file_path: '/a/b.md' })).toBe('/a/b.md');
		expect(getActionPattern('Read', {})).toBeNull();
		expect(getActionPattern('Write', { file_path: '' })).toBeNull();
		expect(getActionPattern('Edit', { file_path: 7 })).toBeNull();
	});

	it('NotebookEdit → notebook_path ?? file_path or null', () => {
		expect(getActionPattern('NotebookEdit', { notebook_path: '/n.ipynb' })).toBe('/n.ipynb');
		expect(getActionPattern('NotebookEdit', { file_path: '/f.ipynb' })).toBe('/f.ipynb');
		expect(
			getActionPattern('NotebookEdit', { notebook_path: '/n.ipynb', file_path: '/f.ipynb' }),
		).toBe('/n.ipynb');
		expect(getActionPattern('NotebookEdit', {})).toBeNull();
	});

	it('Glob/Grep → pattern or null', () => {
		expect(getActionPattern('Glob', { pattern: '**/*.md' })).toBe('**/*.md');
		expect(getActionPattern('Grep', { pattern: 'TODO' })).toBe('TODO');
		expect(getActionPattern('Glob', {})).toBeNull();
		expect(getActionPattern('Grep', { pattern: '' })).toBeNull();
	});

	it('default tool → JSON.stringify(input)', () => {
		expect(getActionPattern('WebFetch', { url: 'https://x' })).toBe('{"url":"https://x"}');
		expect(getActionPattern('Unknown', {})).toBe('{}');
	});
});

describe('getActionDescription (TEST-AS-015)', () => {
	it('renders the per-tool description', () => {
		expect(getActionDescription('Bash', { command: 'git status' })).toBe(
			'Run command: git status',
		);
		expect(getActionDescription('Read', { file_path: '/a.md' })).toBe('Read file: /a.md');
		expect(getActionDescription('Write', { file_path: '/a.md' })).toBe('Write to file: /a.md');
		expect(getActionDescription('Edit', { file_path: '/a.md' })).toBe('Edit file: /a.md');
		expect(getActionDescription('Glob', { pattern: '**/*.md' })).toBe(
			'Search files matching: **/*.md',
		);
		expect(getActionDescription('Grep', { pattern: 'TODO' })).toBe('Search content matching: TODO');
	});

	it('renders {tool}: {pattern} for an unknown tool', () => {
		expect(getActionDescription('WebFetch', { url: 'https://x' })).toBe(
			'WebFetch: {"url":"https://x"}',
		);
	});

	it('renders (unknown) when the pattern is null', () => {
		expect(getActionDescription('Read', {})).toBe('Read file: (unknown)');
		expect(getActionDescription('NotebookEdit', {})).toBe('NotebookEdit: (unknown)');
	});
});

describe('matchesRulePattern — no-rule / wildcard / exact / null guard (TEST-AS-014)', () => {
	it('no rule pattern (undefined/empty) → match-all true', () => {
		expect(matchesRulePattern('Bash', 'git status', undefined)).toBe(true);
		expect(matchesRulePattern('Read', '/a/b.md', '')).toBe(true);
		expect(matchesRulePattern('Write', null, undefined)).toBe(true);
	});

	it("rule '*' → true", () => {
		expect(matchesRulePattern('Bash', 'git status', '*')).toBe(true);
		expect(matchesRulePattern('Glob', '**/*.md', '*')).toBe(true);
	});

	it('exact match (post-normalise) → true', () => {
		expect(matchesRulePattern('Bash', 'git status', 'git status')).toBe(true);
		expect(matchesRulePattern('Read', 'C:\\a\\b.md', 'C:/a/b.md')).toBe(true);
	});

	it('EC-AS-9: null action + a content rule → false (the null-action guard)', () => {
		expect(matchesRulePattern('Read', null, '/a/b')).toBe(false);
		expect(matchesRulePattern('Bash', null, 'git *')).toBe(false);
		// A null action with no rule still matches all (no rule short-circuits first).
		expect(matchesRulePattern('Read', null, undefined)).toBe(true);
	});
});

describe('matchesRulePattern — Bash explicit-wildcard only (TEST-AS-011, EC-AS-7)', () => {
	it('"git *" matches "git status" (space wildcard form)', () => {
		expect(matchesRulePattern('Bash', 'git status', 'git *')).toBe(true);
		expect(matchesRulePattern('Bash', 'git commit -m x', 'git *')).toBe(true);
	});

	it('"npm:*" matches "npm install" (CC colon form)', () => {
		expect(matchesRulePattern('Bash', 'npm install', 'npm:*')).toBe(true);
		expect(matchesRulePattern('Bash', 'npm run build', 'npm:*')).toBe(true);
	});

	it('"git" (no wildcard) does NOT match "git status" (bare prefix rejected)', () => {
		expect(matchesRulePattern('Bash', 'git status', 'git')).toBe(false);
	});

	it('"git *" does NOT match "github" (needs the git word boundary)', () => {
		expect(matchesRulePattern('Bash', 'github', 'git *')).toBe(false);
	});

	it('"git*" matches "git status" but not "github" (suffix-* prefix needs a trailing space)', () => {
		expect(matchesRulePattern('Bash', 'git status', 'git*')).toBe(true);
		expect(matchesRulePattern('Bash', 'github', 'git*')).toBe(false);
	});
});

describe('matchesRulePattern — File path-segment boundary (TEST-AS-012, EC-AS-8)', () => {
	it('"/a/b" matches "/a/b/c.md" (segment boundary)', () => {
		expect(matchesRulePattern('Write', '/a/b/c.md', '/a/b')).toBe(true);
	});

	it('"/a/b" matches "/a/b" (equal length)', () => {
		expect(matchesRulePattern('Read', '/a/b', '/a/b')).toBe(true);
	});

	it('"/a/b" does NOT match "/a/bc.md" (not a / boundary)', () => {
		expect(matchesRulePattern('Edit', '/a/bc.md', '/a/b')).toBe(false);
	});

	it('"/a/b/" trailing slash matches anything under the subtree', () => {
		expect(matchesRulePattern('Write', '/a/b/c/d.md', '/a/b/')).toBe(true);
		expect(matchesRulePattern('Write', '/a/b/', '/a/b/')).toBe(true);
	});

	it('"C:\\\\notes" matches "C:/notes/x.md" (backslash normalise then prefix)', () => {
		expect(matchesRulePattern('Read', 'C:/notes/x.md', 'C:\\notes')).toBe(true);
	});

	it('NotebookEdit uses the same path-segment boundary', () => {
		expect(matchesRulePattern('NotebookEdit', '/nb/a.ipynb', '/nb')).toBe(true);
		expect(matchesRulePattern('NotebookEdit', '/nbx.ipynb', '/nb')).toBe(false);
	});
});

describe('matchesRulePattern — Other tools simple prefix (TEST-AS-013)', () => {
	it('"TODO" matches "TODO-list" (Glob/Grep simple prefix)', () => {
		expect(matchesRulePattern('Glob', 'TODO-list', 'TODO')).toBe(true);
		expect(matchesRulePattern('Grep', 'TODO-list', 'TODO')).toBe(true);
	});

	it('a non-prefix → false', () => {
		expect(matchesRulePattern('Grep', 'FIXME', 'TODO')).toBe(false);
	});
});

describe('the matcher is pure + total — never throws (NFR-AS-009)', () => {
	it('getActionPattern never throws for any input', () => {
		const inputs: Record<string, unknown>[] = [
			{},
			{ command: null },
			{ file_path: undefined },
			{ pattern: 123 },
			{ nested: { deep: [1, 2, 3] } },
		];
		for (const input of inputs) {
			expect(() => getActionPattern('Bash', input)).not.toThrow();
			expect(() => getActionPattern('Read', input)).not.toThrow();
			expect(() => getActionPattern('Mystery', input)).not.toThrow();
		}
	});

	it('getActionDescription never throws', () => {
		expect(() => getActionDescription('Bash', {})).not.toThrow();
		expect(() => getActionDescription('Mystery', { x: 1 })).not.toThrow();
	});

	it('matchesRulePattern never throws across odd inputs', () => {
		expect(() => matchesRulePattern('', '', '')).not.toThrow();
		expect(() => matchesRulePattern('Bash', '', '*')).not.toThrow();
		expect(() => matchesRulePattern('Read', null, undefined)).not.toThrow();
		expect(() => matchesRulePattern('Glob', 'x', 'y')).not.toThrow();
	});
});
