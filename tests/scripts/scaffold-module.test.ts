import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	isValidModuleName,
	plannedFiles,
	renderEventsFile,
	renderModuleFile,
	renderTestFile,
	renderViewFile,
	scaffoldModule,
	toCamelCase,
	toPascalCase,
	wiringInstructions,
} from '../../scripts/scaffold-module.mjs';

async function makeTempRoot(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), 'specorator-scaffold-'));
}

describe('scaffold-module — name validation', () => {
	it.each([
		['hello', true],
		['template-installer', true],
		['workflow-nav', true],
		['a', true],
		['Hello', false],
		['hello_world', false],
		['1hello', false],
		['hello-', false],
		['-hello', false],
		['hello--world', false],
		['', false],
	])('isValidModuleName(%j) === %s', (input, expected) => {
		expect(isValidModuleName(input)).toBe(expected);
	});
});

describe('scaffold-module — case helpers', () => {
	it('PascalCase preserves segments', () => {
		expect(toPascalCase('template-installer')).toBe('TemplateInstaller');
	});
	it('camelCase lowercases first segment', () => {
		expect(toCamelCase('template-installer')).toBe('templateInstaller');
	});
});

describe('scaffold-module — render output', () => {
	it('module file references the events module and module factory', () => {
		const out = renderModuleFile('template-installer');
		expect(out).toContain("import './template-installer-events';");
		expect(out).toContain("from '@/modules/module'");
		expect(out).toContain('templateInstallerModule');
		expect(out).toContain("id: 'template-installer'");
		expect(out).toContain("'template-installer:initialized'");
	});

	it('events file augments the EventMap with module-prefixed channel', () => {
		const out = renderEventsFile('template-installer');
		expect(out).toContain("declare module '@/domain/shared/event-bus'");
		expect(out).toContain("'template-installer:initialized'");
	});

	it('view SFC carries data-testid and scoped style', () => {
		const out = renderViewFile('template-installer');
		expect(out).toContain('data-testid="template-installer-view"');
		expect(out).toContain('<style scoped>');
	});

	it('test stub imports fakeModulePorts and asserts emit', () => {
		const out = renderTestFile('template-installer');
		expect(out).toContain("from '@/modules/template-installer/template-installer-module'");
		expect(out).toContain('fakeModulePorts');
		expect(out).toContain("ports.bus.on('template-installer:initialized'");
	});
});

describe('scaffold-module — file plan', () => {
	it('plans four files at the expected paths', () => {
		const plan = plannedFiles('/repo', 'template-installer');
		const paths = plan.map((f) => f.path.replace(/\\/g, '/'));
		expect(paths).toEqual([
			'/repo/src/modules/template-installer/template-installer-module.ts',
			'/repo/src/modules/template-installer/template-installer-events.ts',
			'/repo/src/modules/template-installer/TemplateInstallerView.vue',
			'/repo/tests/modules/template-installer/template-installer-module.test.ts',
		]);
	});
});

describe('scaffold-module — write behavior', () => {
	it('rejects an invalid name without writing anything', async () => {
		const root = await makeTempRoot();
		try {
			await expect(scaffoldModule({ repoRoot: root, name: 'Bad Name' })).rejects.toThrow(
				/Invalid module name/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('creates all four files on first run', async () => {
		const root = await makeTempRoot();
		try {
			const result = await scaffoldModule({ repoRoot: root, name: 'demo-module' });
			expect(result.created).toHaveLength(4);
			expect(result.skipped).toHaveLength(0);
			const moduleFile = await readFile(
				path.join(root, 'src', 'modules', 'demo-module', 'demo-module-module.ts'),
				'utf8',
			);
			expect(moduleFile).toContain('demoModuleModule');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('skips existing files without overwriting (idempotent)', async () => {
		const root = await makeTempRoot();
		try {
			const moduleDir = path.join(root, 'src', 'modules', 'demo-module');
			await mkdir(moduleDir, { recursive: true });
			const targetFile = path.join(moduleDir, 'demo-module-module.ts');
			await writeFile(targetFile, 'EXISTING_CONTENT', 'utf8');

			const result = await scaffoldModule({ repoRoot: root, name: 'demo-module' });

			expect(result.skipped.map((f) => f.role)).toContain('module');
			expect(result.created.map((f) => f.role)).not.toContain('module');
			const after = await readFile(targetFile, 'utf8');
			expect(after).toBe('EXISTING_CONTENT');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('returns no created files when every target already exists', async () => {
		const root = await makeTempRoot();
		try {
			await scaffoldModule({ repoRoot: root, name: 'demo-module' });
			const second = await scaffoldModule({ repoRoot: root, name: 'demo-module' });
			expect(second.created).toHaveLength(0);
			expect(second.skipped).toHaveLength(4);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe('scaffold-module — wiring instructions', () => {
	it('mentions the registry edit and the test command', () => {
		const text = wiringInstructions('template-installer');
		expect(text).toContain('src/modules/index.ts');
		expect(text).toContain('templateInstallerModule');
		expect(text).toContain('vitest run tests/modules/template-installer');
	});
});
