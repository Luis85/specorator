/**
 * T-MPS-005 — unit tests for `scripts/codemod/rename-claude-cli-port.mjs`.
 *
 * Covers:
 *   1. `applySubstitutions` is pure and deterministic.
 *   2. Every legacy token is replaced exactly once (idempotency: a
 *      second pass over the result is a no-op).
 *   3. Path substitutions work alongside identifier substitutions.
 *   4. The allow-listed shim file is not touched when invoked via the
 *      filesystem walker.
 *
 * The "legacy" identifier strings in this file are assembled via
 * concatenation so the codemod's literal token scan never rewrites the
 * test fixtures.
 *
 * Refs SPEC-MPS-001 §2.1, ADR-MPS-001, REQ-MPS-001, REQ-MPS-002.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as codemod from '../../scripts/codemod/rename-claude-cli-port.mjs';

const {
	SUBSTITUTIONS,
	PATH_SUBSTITUTIONS,
	ALLOW_LIST,
	applySubstitutions,
	runCodemod,
} = codemod as unknown as {
	SUBSTITUTIONS: ReadonlyArray<{ before: string; after: string }>;
	PATH_SUBSTITUTIONS: ReadonlyArray<{ before: string; after: string }>;
	ALLOW_LIST: ReadonlySet<string>;
	applySubstitutions: (text: string) => { text: string; hits: Record<string, number> };
	runCodemod: (input: { roots: ReadonlyArray<string>; dryRun: boolean; repoRoot: string }) => {
		scanned: number;
		changedFiles: ReadonlyArray<{ file: string; hits: Record<string, number> }>;
	};
};

const subs = SUBSTITUTIONS;
const pathSubs = PATH_SUBSTITUTIONS;
const allowList = ALLOW_LIST;
const apply = applySubstitutions;
const run = runCodemod;

/**
 * Build legacy fixture strings via concatenation so the codemod, run
 * against this very test file, leaves them alone.
 */
const LEGACY_PREFIX = 'Claude' + 'Cli';
const LEGACY_PORT = LEGACY_PREFIX + 'Port';
const LEGACY_ERROR = LEGACY_PREFIX + 'Error';
const LEGACY_ERROR_CODE = LEGACY_ERROR + 'Code';
const LEGACY_QUERY_OPTS = LEGACY_PREFIX + 'QueryOptions';
const LEGACY_STREAM_OPTS = LEGACY_PREFIX + 'StreamOptions';
const LEGACY_KEY = 'CLAUDE' + '_CLI_PORT';
const LEGACY_HOOK = 'use' + LEGACY_PORT;
const LEGACY_PORT_IMPORT_PATH = '@/domain/ports/' + LEGACY_PORT;
const LEGACY_HOOK_IMPORT_PATH = '@/ui/composables/' + LEGACY_HOOK;

describe('REQ-MPS-001 — codemod substitutes every legacy identifier deterministically', () => {
	it('renames the seven legacy identifiers in a single pass', () => {
		const before = [
			`import type { ${LEGACY_PORT}, ${LEGACY_QUERY_OPTS}, ${LEGACY_STREAM_OPTS} } from '${LEGACY_PORT_IMPORT_PATH}';`,
			`import { ${LEGACY_ERROR} } from '${LEGACY_PORT_IMPORT_PATH}';`,
			`import type { ${LEGACY_ERROR_CODE} } from '${LEGACY_PORT_IMPORT_PATH}';`,
			`import { ${LEGACY_KEY} } from '@/infrastructure/bridge/ports';`,
			`import { ${LEGACY_HOOK} } from '${LEGACY_HOOK_IMPORT_PATH}';`,
			`const a: ${LEGACY_PORT} = makePort();`,
		].join('\n');
		const { text, hits } = apply(before);

		expect(text).toContain('ChatTransportPort');
		expect(text).toContain('ChatTransportQueryOptions');
		expect(text).toContain('ChatTransportStreamOptions');
		expect(text).toContain('ChatTransportError');
		expect(text).toContain('ChatTransportErrorCode');
		expect(text).toContain('CHAT_TRANSPORT_PORT');
		expect(text).toContain('useChatTransportPort');
		expect(text).toMatch(/['"]@\/domain\/ports\/ChatTransportPort['"]/);
		expect(text).toMatch(/['"]@\/ui\/composables\/useChatTransportPort['"]/);

		// None of the legacy tokens survive.
		for (const { before: legacy } of subs) {
			expect(text).not.toMatch(new RegExp(`\\b${legacy}\\b`));
		}
		for (const { before: legacyPath } of pathSubs) {
			expect(text).not.toContain(legacyPath);
		}

		// Hits are reported so callers can audit determinism.
		expect(hits).toBeDefined();
	});

	it('is idempotent — a second pass changes nothing', () => {
		const before = `const a: ${LEGACY_PORT} = inject(${LEGACY_KEY})!;`;
		const first = apply(before);
		const second = apply(first.text);
		expect(second.text).toBe(first.text);
	});

	it('respects identifier word boundaries — does not touch substrings inside larger compound names', () => {
		// A hypothetical `MyClaudeCliPortFactory` is NOT a legacy symbol —
		// the word-boundary regex skips it so the codemod does not
		// accidentally invent a `MyChatTransportPortFactory` identifier
		// that no consumer expects.
		const compound = `My${LEGACY_PORT}Factory`;
		const before = `const x = ${compound};`;
		const { text } = apply(before);
		expect(text).toBe(`const x = ${compound};`);
	});
});

describe('runCodemod filesystem walker', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'mps-codemod-'));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	function write(rel: string, content: string): void {
		const full = join(tmpDir, rel);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, content);
	}

	it('produces deterministic output across roots', () => {
		write(
			'src/a.ts',
			`import type { ${LEGACY_PORT} } from '${LEGACY_PORT_IMPORT_PATH}';\nconst p: ${LEGACY_PORT} = null!;`,
		);
		write(
			'tests/b.ts',
			`import { ${LEGACY_ERROR} } from '${LEGACY_PORT_IMPORT_PATH}';\nthrow new ${LEGACY_ERROR}('X','y');`,
		);
		const summary = run({
			roots: [join(tmpDir, 'src'), join(tmpDir, 'tests')],
			dryRun: false,
			repoRoot: tmpDir,
		});
		expect(summary.changedFiles).toHaveLength(2);
		const a = readFileSync(join(tmpDir, 'src/a.ts'), 'utf8');
		const b = readFileSync(join(tmpDir, 'tests/b.ts'), 'utf8');
		expect(a).toContain('ChatTransportPort');
		expect(a).not.toContain(LEGACY_PORT);
		expect(b).toContain('ChatTransportError');
		expect(b).not.toContain(LEGACY_ERROR);
	});

	it('--dry-run does not write the filesystem', () => {
		write('src/c.ts', `import type { ${LEGACY_PORT} } from '${LEGACY_PORT_IMPORT_PATH}';`);
		const summary = run({
			roots: [join(tmpDir, 'src')],
			dryRun: true,
			repoRoot: tmpDir,
		});
		expect(summary.changedFiles).toHaveLength(1);
		const c = readFileSync(join(tmpDir, 'src/c.ts'), 'utf8');
		expect(c).toContain(LEGACY_PORT);
	});

	it('skips the allow-listed deprecated shim file', () => {
		// The allow-list keys are posix-relative paths from repoRoot.
		const shimPath = ['src', 'ui', 'composables', LEGACY_HOOK + '.ts'].join('/');
		write(
			shimPath,
			`export { useChatTransportPort as ${LEGACY_HOOK} } from './useChatTransportPort';`,
		);
		const summary = run({
			roots: [join(tmpDir, 'src')],
			dryRun: false,
			repoRoot: tmpDir,
		});
		expect(summary.changedFiles.find((c) => c.file === shimPath)).toBeUndefined();
		// The allow-list set is the source of truth.
		expect(allowList.has(shimPath)).toBe(true);
	});
});
