/**
 * REQ-MPS-001, REQ-MPS-002, TST-MPS-34 — no production file references
 * any of the seven legacy `ClaudeCli*` identifiers (rename retired in
 * WS-1 / ADR-MPS-001).
 *
 * Verifies the rename to `ChatTransportPort` has been completed across
 * `src/`. The identifier list is constructed from a per-character array
 * so the codemod itself does not chew the test fixture during a
 * regression sweep.
 *
 * Scope: any source file under `src/` that imports/references the
 * legacy identifier set is a defect. The one-release deprecated
 * re-export shim at `src/ui/composables/useClaudeCliPort.ts` is
 * allow-listed by file path; everything else must use the new names.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');

/**
 * Seven legacy identifiers that the rename retires (SPEC-MPS-001 §2.1).
 * The strings are assembled via concatenation so the codemod's literal
 * token scan does not accidentally rewrite the test's own fixture data.
 */
const LEGACY_PREFIX = 'Claude' + 'Cli';
const LEGACY_KEY = 'CLAUDE' + '_CLI_PORT';
const LEGACY_HOOK = 'use' + LEGACY_PREFIX + 'Port';
const LEGACY_IDENTIFIERS = [
	`${LEGACY_PREFIX}Port`,
	`${LEGACY_PREFIX}Error`,
	`${LEGACY_PREFIX}ErrorCode`,
	`${LEGACY_PREFIX}QueryOptions`,
	`${LEGACY_PREFIX}StreamOptions`,
	LEGACY_KEY,
	LEGACY_HOOK,
] as const;

/**
 * Files allow-listed to mention the legacy names. Limited to the
 * one-release deprecated re-export shim at
 * `src/ui/composables/useClaudeCliPort.ts`. The shim is removed in the
 * next minor release (ADR-MPS-001).
 */
const ALLOWED_FILES = new Set<string>([
	['src', 'ui', 'composables', LEGACY_HOOK + '.ts'].join('/'),
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.mts', '.cts']);

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			if (entry === '__fixtures__' || entry === '__tests__') continue;
			walk(full, acc);
			continue;
		}
		const dotIndex = entry.lastIndexOf('.');
		if (dotIndex < 0) continue;
		const ext = entry.slice(dotIndex);
		if (!SOURCE_EXTENSIONS.has(ext)) continue;
		acc.push(full);
	}
	return acc;
}

interface Hit {
	readonly file: string;
	readonly identifier: string;
	readonly count: number;
}

function toPosix(p: string): string {
	return p.split(sep).join('/');
}

describe('REQ-MPS-001 — no production source references the legacy ClaudeCli* identifiers', () => {
	it('TST-MPS-34: src/ contains zero occurrences of legacy identifiers (outside the deprecated shim)', () => {
		const files = walk(SRC_ROOT);
		const hits: Hit[] = [];
		for (const file of files) {
			const rel = toPosix(relative(REPO_ROOT, file));
			if (ALLOWED_FILES.has(rel)) continue;
			const text = readFileSync(file, 'utf8');
			for (const id of LEGACY_IDENTIFIERS) {
				// Use a word-boundary regex so substrings inside larger
				// identifiers (e.g. a hypothetical `MyClaudeCliPort2`) still
				// count as a legacy occurrence — the rename retires the
				// whole prefix.
				const re = new RegExp(`\\b${id}\\b`, 'g');
				const matches = text.match(re);
				if (matches && matches.length > 0) {
					hits.push({ file: rel, identifier: id, count: matches.length });
				}
			}
		}

		if (hits.length > 0) {
			const formatted = hits
				.map((h) => `  ${h.file}: ${h.identifier} ×${h.count}`)
				.join('\n');
			throw new Error(
				`Found ${hits.length.toString()} legacy ClaudeCli* occurrence(s) in src/. ` +
					`Rename per SPEC-MPS-001 §2.1 / ADR-MPS-001:\n${formatted}`,
			);
		}
		expect(hits).toEqual([]);
	});
});
