/**
 * T-PSR-028 (TEST-PSR-023) — RED: CI must trigger on the `next` integration
 * branch. SPEC-PSR-015. Fails against the current `[develop, demo, main]`
 * branch lists and goes GREEN after T-PSR-029 adds `next` to both.
 * Traces: REQ-PSR-012, NFR-PSR-008.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

interface CiWorkflow {
	readonly on: {
		readonly push: { readonly branches: readonly string[] };
		readonly pull_request: { readonly branches: readonly string[] };
	};
}

describe('ci.yml `next` trigger (TEST-PSR-023)', () => {
	const raw = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
	const ci = parse(raw) as CiWorkflow;

	it('on.push.branches contains `next`', () => {
		expect(ci.on.push.branches).toContain('next');
	});

	it('on.pull_request.branches contains `next`', () => {
		expect(ci.on.pull_request.branches).toContain('next');
	});
});
