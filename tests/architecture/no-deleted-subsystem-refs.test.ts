/**
 * Deleted-subsystem guard (SPEC-PSR-013/014; REQ-PSR-005, NFR-PSR-009).
 *
 * - TEST-PSR-016 (T-PSR-027): ESLint over `src/**` reports zero
 *   `no-restricted-imports` violations carrying the DELETED_SUBSYSTEM_BAN /
 *   deleted-injection-key message — regression-proof against a later phase
 *   re-importing a deleted subsystem.
 * - TEST-PSR-017 (T-PSR-025): positive control — a fixture importing a deleted
 *   path trips the ban, proving the guard fires.
 *
 * Runs in the `unit` project via the ESLint Node API (OC-PSR-6 reuse of the
 * `tests/eslint-boundaries.test.ts` pattern). No new gate step.
 */
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const BAN_FRAGMENT = 'deleted in the P0 reboot';

describe('deleted-subsystem guard (REQ-PSR-005, NFR-PSR-009)', () => {
	it('TEST-PSR-016: no src/** module imports a deleted subsystem path or injection key', async () => {
		const eslint = new ESLint({ cwd: repoRoot, errorOnUnmatchedPattern: true });
		const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.vue']);
		const offending = results.flatMap((r) =>
			r.messages
				.filter((m) => m.ruleId === 'no-restricted-imports' && m.message.includes(BAN_FRAGMENT))
				.map((m) => ({ file: r.filePath, message: m.message })),
		);
		expect(offending, JSON.stringify(offending, null, 2)).toHaveLength(0);
	}, 180_000);

	it('TEST-PSR-017: positive control — importing a deleted path trips the ban', async () => {
		const eslint = new ESLint({ cwd: repoRoot, ignore: false });
		const fixture = resolve(repoRoot, 'src/application/__fixtures__/imports-deleted-subsystem.ts');
		const results = await eslint.lintFiles([fixture]);
		const tripped = results.some((r) =>
			r.messages.some(
				(m) => m.ruleId === 'no-restricted-imports' && m.message.includes(BAN_FRAGMENT),
			),
		);
		expect(tripped).toBe(true);
	}, 180_000);
});
