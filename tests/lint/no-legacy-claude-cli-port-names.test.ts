/**
 * REQ-MPS-001, REQ-MPS-002, TST-MPS-34 — no production file imports
 * `ClaudeCliPort` (or any of the six sibling legacy identifiers).
 *
 * Verifies that the rename from `ClaudeCliPort` → `ChatTransportPort`
 * (SPEC-MPS-001 §2.1, ADR-MPS-001) has been completed across `src/`.
 *
 * Scope: any source file under `src/` that imports/references the
 * legacy identifier set is a defect. The one-release deprecated
 * re-export shim at `src/ui/composables/useClaudeCliPort.ts` is
 * allow-listed by file path; everything else must use the new names.
 *
 * Today (pre-rename) every occurrence in the production tree should
 * make this test fail with a clear count, so the codemod cannot land
 * silently.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');

/** Seven legacy identifiers that the rename retires (SPEC-MPS-001 §2.1). */
const LEGACY_IDENTIFIERS = [
	'ClaudeCliPort',
	'ClaudeCliError',
	'ClaudeCliErrorCode',
	'ClaudeCliQueryOptions',
	'ClaudeCliStreamOptions',
	'CLAUDE_CLI_PORT',
	'useClaudeCliPort',
] as const;

/**
 * Files allow-listed to mention the legacy names. Limited to the
 * one-release deprecated re-export shim at
 * `src/ui/composables/useClaudeCliPort.ts`. The shim is removed in the
 * next minor release (ADR-MPS-001).
 */
const ALLOWED_FILES = new Set<string>([
	'src/ui/composables/useClaudeCliPort.ts',
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
