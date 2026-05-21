/**
 * NFR-MPS-012, TST-MPS-35 — `ChatTransportPort.ts` is layer-clean.
 *
 * The renamed port file must not depend on `obsidian`,
 * `@anthropic-ai/claude-agent-sdk`, `node:child_process`, `node:https`,
 * or anything outside `src/domain/`. The narrow-ports invariant
 * (ADR-008) requires the port interface to express only domain
 * concepts; any cross-layer import is a defect.
 *
 * This test fails until T-MPS-004 renames the file from
 * `ClaudeCliPort.ts` to `ChatTransportPort.ts` and confirms the import
 * list stays domain-internal.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const PORT_FILE = join(REPO_ROOT, 'src', 'domain', 'ports', 'ChatTransportPort.ts');

/**
 * Banned import sources for the port file. Anything outside `src/domain/`
 * — including Node built-ins and third-party SDKs — leaks transport
 * details into the domain interface.
 */
const FORBIDDEN_SOURCES: ReadonlyArray<{ readonly pattern: RegExp; readonly label: string }> = [
	{ pattern: /^obsidian$/, label: "'obsidian'" },
	{ pattern: /^@anthropic-ai\/claude-agent-sdk(\/|$)/, label: "'@anthropic-ai/claude-agent-sdk'" },
	{ pattern: /^node:child_process$/, label: "'node:child_process'" },
	{ pattern: /^node:https$/, label: "'node:https'" },
];

/**
 * Allowed import-source prefixes. Anything that resolves under
 * `src/domain/` is fine; everything else (application, infrastructure,
 * UI, third-party) is forbidden.
 */
function isAllowedDomainSource(spec: string): boolean {
	if (spec.startsWith('@/domain/')) return true;
	if (spec.startsWith('./') || spec.startsWith('../')) {
		// Relative imports from a file under src/domain/ports/ can only
		// reach into src/domain/ (sibling folders or shared/). Reject any
		// path that escapes the domain root.
		return !spec.includes('infrastructure') && !spec.includes('application') && !spec.includes('/ui/');
	}
	return false;
}

function collectImportSources(source: string): string[] {
	const sources: string[] = [];
	// `import ... from '<src>'`  (incl. `import type`)
	const importRe = /\bimport\s+(?:type\s+)?(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;
	// `export ... from '<src>'`
	const exportRe = /\bexport\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
	// dynamic `import('<src>')`
	const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	for (const re of [importRe, exportRe, dynamicRe]) {
		let m: RegExpExecArray | null;
		while ((m = re.exec(source)) !== null) {
			sources.push(m[1] ?? '');
		}
	}
	return sources;
}

describe('NFR-MPS-012 — ChatTransportPort.ts is layer-clean', () => {
	it('TST-MPS-35: the file exists at src/domain/ports/ChatTransportPort.ts', () => {
		expect(existsSync(PORT_FILE)).toBe(true);
	});

	it('TST-MPS-35: imports zero forbidden sources (obsidian / SDK / node built-ins / cross-layer)', () => {
		if (!existsSync(PORT_FILE)) {
			throw new Error(
				`Cannot evaluate import cleanliness: ${PORT_FILE} does not exist yet. ` +
					'Complete T-MPS-004 to rename the port file before re-running.',
			);
		}
		const text = readFileSync(PORT_FILE, 'utf8');
		const sources = collectImportSources(text);

		const violations: string[] = [];
		for (const spec of sources) {
			for (const { pattern, label } of FORBIDDEN_SOURCES) {
				if (pattern.test(spec)) {
					violations.push(`forbidden import: ${label} (resolved as '${spec}')`);
				}
			}
			if (!isAllowedDomainSource(spec)) {
				violations.push(`non-domain import: '${spec}' (must resolve under src/domain/)`);
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`ChatTransportPort.ts violates NFR-MPS-012:\n  ${violations.join('\n  ')}`,
			);
		}
		expect(violations).toEqual([]);
	});
});
