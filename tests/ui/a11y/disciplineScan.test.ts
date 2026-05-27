/**
 * T-AY-015 (RED -> green) — discipline scan: no added raw-HTML sink in the P12
 * diff (TEST-AY-015 diff leg). SPEC-AY-011, REQ-AY-015, NFR-AY-003 — the security
 * leg. (The accessibility.css token/comment leg rides T-AY-003.)
 *
 * Asserts the P12 source diff vs `next` adds NO `innerHTML`/`outerHTML`/
 * `insertAdjacentHTML` assignment and NO `v-html`, and no new suppression of the
 * raw-HTML guards. The additive ARIA edits bind attributes declaratively and the
 * `.sr-only` notice text is rendered as `{{ }}` text — never injected as markup.
 *
 * Traces: TEST-AY-015, SPEC-AY-011, REQ-AY-015, NFR-AY-003.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');

function git(args: string[]): string {
	return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

/**
 * The baseline ref — `next` locally, `origin/next` in a fetched CI checkout, or
 * `null` when neither is present (CI's shallow PR checkout). The diff scan SKIPS
 * when null — it is meaningful only where a baseline is reachable; never errors.
 */
function resolveBaseRef(): string | null {
	for (const ref of ['next', 'origin/next']) {
		try {
			execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
				cwd: REPO_ROOT,
				stdio: 'pipe',
			});
			return ref;
		} catch {
			/* ref not present — try the next candidate */
		}
	}
	return null;
}

const BASE_REF = resolveBaseRef();

/**
 * The added (`+`) lines of the P12 src/ diff vs the next baseline. Returns `[]`
 * when no baseline is reachable — `describe.skipIf` skips the `it` bodies, but the
 * describe *factory* still runs at collection time, so this must never invoke git
 * with a null ref (that crashed CI's shallow checkout: `git diff  -- src`).
 */
function addedSrcLines(): string[] {
	if (BASE_REF === null) return [];
	const diff = git(['diff', BASE_REF, '--', 'src']);
	return diff
		.split('\n')
		.filter((line) => line.startsWith('+') && !line.startsWith('+++'))
		.map((line) => line.slice(1));
}

describe.skipIf(BASE_REF === null)('discipline scan — no added raw-HTML sink (TEST-AY-015 diff leg)', () => {
	const added = addedSrcLines();

	it('the P12 diff adds no innerHTML / outerHTML / insertAdjacentHTML assignment', () => {
		const offenders = added.filter((l) =>
			/\b(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(l),
		);
		expect(offenders, `raw-HTML sink added: ${JSON.stringify(offenders)}`).toEqual([]);
	});

	it('the P12 diff adds no v-html directive', () => {
		// Match the directive usage (`v-html=` / `:v-html=` / a bound v-html), not a
		// prose mention of the banned directive in a comment.
		const offenders = added.filter((l) => /\bv-html\s*=|:v-html\b/.test(l));
		expect(offenders, `v-html added: ${JSON.stringify(offenders)}`).toEqual([]);
	});

	it('the P12 diff adds no new eslint-disable of the raw-HTML / v-html guards', () => {
		const offenders = added.filter(
			(l) =>
				l.includes('eslint-disable') &&
				/(no-restricted-properties|vue\/no-v-html|no-restricted-syntax)/.test(l),
		);
		expect(offenders, `new raw-HTML guard suppression: ${JSON.stringify(offenders)}`).toEqual([]);
	});
});
