import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyScaffold } from '../../scripts/verify-scaffold.mjs';

async function makeTempRoot(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), 'specorator-verify-'));
}

function toPascal(name: string): string {
	return name
		.split('-')
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');
}

async function makeCompleteModule(repoRoot: string, name: string): Promise<void> {
	const pascal = toPascal(name);
	await mkdir(path.join(repoRoot, 'src', 'modules', name), { recursive: true });
	await mkdir(path.join(repoRoot, 'tests', 'modules', name), { recursive: true });
	const files = [
		path.join(repoRoot, 'src', 'modules', name, `${name}-module.ts`),
		path.join(repoRoot, 'src', 'modules', name, `${name}-events.ts`),
		path.join(repoRoot, 'src', 'modules', name, `${pascal}View.vue`),
		path.join(repoRoot, 'tests', 'modules', name, `${name}-module.test.ts`),
		path.join(repoRoot, 'tests', 'modules', name, `${pascal}View.po.ts`),
	];
	for (const f of files) {
		await writeFile(f, '// stub', 'utf8');
	}
}

describe('verify-scaffold', () => {
	it('returns empty array when all required files are present', async () => {
		const root = await makeTempRoot();
		try {
			await makeCompleteModule(root, 'demo-widget');
			const missing = await verifyScaffold(root);
			expect(missing).toHaveLength(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports a missing view-po file', async () => {
		const root = await makeTempRoot();
		try {
			await makeCompleteModule(root, 'demo-widget');
			await rm(path.join(root, 'tests', 'modules', 'demo-widget', 'DemoWidgetView.po.ts'));
			const missing = await verifyScaffold(root);
			expect(missing.map((f) => f.replace(/\\/g, '/'))).toContain(
				'tests/modules/demo-widget/DemoWidgetView.po.ts',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports all five missing files for an empty module directory', async () => {
		const root = await makeTempRoot();
		try {
			await mkdir(path.join(root, 'src', 'modules', 'bare-widget'), { recursive: true });
			const missing = await verifyScaffold(root);
			expect(missing).toHaveLength(5);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
