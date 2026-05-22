/**
 * Tests for `scripts/lint-style-tokens.mjs` — WS-AUX-9 (T-AUX-336, T-AUX-339).
 *
 * The guard scans `.vue` and `.css` files under guarded paths for:
 *   (a) raw Obsidian CSS vars (`var(--background-*)`, `var(--text-*)`,
 *       `var(--interactive-*)`) outside `tokens.css`,
 *   (b) physical-side properties (`margin-left|right`, `padding-left|right`,
 *       `border-(top|bottom)-(left|right)-radius`, `text-align: left|right`).
 *
 * The script is exported as `lintStyleTokens(repoRoot, scanDirs)` so we can
 * point it at a temp dir instead of the real source tree.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lintStyleTokens } from '../../scripts/lint-style-tokens.mjs';

async function makeTempRoot(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), 'specorator-lint-tokens-'));
}

async function writeAt(root: string, relPath: string, body: string): Promise<void> {
	const full = path.join(root, relPath);
	await mkdir(path.dirname(full), { recursive: true });
	await writeFile(full, body, 'utf8');
}

const GUARDED_DIRS = [
	'src/ui/agent',
	'src/ui/components/agent',
];

describe('lint-style-tokens', () => {
	it('returns no violations when sources use --sp-* tokens and logical properties', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/components/agent/Clean.vue',
				`<style scoped>
				.x { padding-inline-start: var(--sp-space-2); color: var(--sp-text-normal); }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			expect(violations).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('flags raw Obsidian vars (--background-primary) under guarded paths', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/components/agent/Leaky.vue',
				`<style scoped>
				.x { background: var(--background-primary); }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toMatchObject({
				kind: 'obsidian-var',
				file: expect.stringContaining('Leaky.vue'),
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('flags physical-side properties (margin-left)', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/agent/Phys.vue',
				`<style scoped>
				.x { margin-left: 4px; padding-right: 8px; }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			const kinds = violations.map((v) => v.kind);
			expect(kinds).toContain('physical-property');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('flags border-top-left-radius style physical corners', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/agent/Phys.vue',
				`<style scoped>
				.x { border-top-left-radius: 4px; }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			expect(violations.some((v) => v.kind === 'physical-property')).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('does NOT scan files outside guarded directories', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/other/Bad.vue',
				`<style scoped>
				.x { background: var(--background-primary); margin-left: 4px; }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			expect(violations).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('ignores text-align: center/start (only flags left/right)', async () => {
		const root = await makeTempRoot();
		try {
			await writeAt(
				root,
				'src/ui/components/agent/Align.vue',
				`<style scoped>
				.ok1 { text-align: center; }
				.ok2 { text-align: start; }
				.bad { text-align: left; }
				</style>`,
			);
			const violations = await lintStyleTokens(root, GUARDED_DIRS);
			expect(violations.length).toBe(1);
			expect(violations[0].kind).toBe('physical-property');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
