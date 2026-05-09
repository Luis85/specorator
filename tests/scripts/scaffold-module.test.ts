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
	renderViewPoFile,
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
		expect(out).toContain('init(ports, _settings)');
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

	it('view PO file carries class name, TID const, and data-testid root', () => {
		const out = renderViewPoFile('template-installer');
		expect(out).toContain('TemplateInstallerViewPageObject');
		expect(out).toContain("root: 'template-installer-view'");
		expect(out).toContain('data-testid=');
	});
});

describe('scaffold-module — file plan', () => {
	it('plans five files at the expected paths', () => {
		const plan = plannedFiles('/repo', 'template-installer');
		const paths = plan.map((f) => f.path.replace(/\\/g, '/'));
		expect(paths).toEqual([
			'/repo/src/modules/template-installer/template-installer-module.ts',
			'/repo/src/modules/template-installer/template-installer-events.ts',
			'/repo/src/modules/template-installer/TemplateInstallerView.vue',
			'/repo/tests/modules/template-installer/template-installer-module.test.ts',
			'/repo/tests/modules/template-installer/TemplateInstallerView.po.ts',
		]);
	});
});

describe('scaffold-module — write behavior', () => {
	it('rejects a name ending in -module and suggests the corrected name', async () => {
		const root = await makeTempRoot();
		try {
			await expect(
				scaffoldModule({ repoRoot: root, name: 'template-module' }),
			).rejects.toThrow(/must not end with '-module'/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

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

	it('creates all five files on first run', async () => {
		const root = await makeTempRoot();
		try {
			const result = await scaffoldModule({ repoRoot: root, name: 'demo-widget' });
			expect(result.created).toHaveLength(5);
			expect(result.skipped).toHaveLength(0);
			const moduleFile = await readFile(
				path.join(root, 'src', 'modules', 'demo-widget', 'demo-widget-module.ts'),
				'utf8',
			);
			expect(moduleFile).toContain('demoWidgetModule');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('skips existing files without overwriting (idempotent)', async () => {
		const root = await makeTempRoot();
		try {
			const moduleDir = path.join(root, 'src', 'modules', 'demo-widget');
			await mkdir(moduleDir, { recursive: true });
			const targetFile = path.join(moduleDir, 'demo-widget-module.ts');
			await writeFile(targetFile, 'EXISTING_CONTENT', 'utf8');

			const result = await scaffoldModule({ repoRoot: root, name: 'demo-widget' });

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
			await scaffoldModule({ repoRoot: root, name: 'demo-widget' });
			const second = await scaffoldModule({ repoRoot: root, name: 'demo-widget' });
			expect(second.created).toHaveLength(0);
			expect(second.skipped).toHaveLength(5);
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
