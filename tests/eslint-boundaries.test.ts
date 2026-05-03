import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

const projectRoot = process.cwd();

interface BoundaryCase {
	readonly name: string;
	readonly file: string;
	readonly expectedRule: string;
	readonly expectedSelector?: string;
}

const CASES: readonly BoundaryCase[] = [
	{
		name: 'domain may not import obsidian',
		file: 'src/domain/__fixtures__/imports-obsidian.ts',
		expectedRule: 'no-restricted-imports',
	},
	{
		name: 'domain may not import infrastructure',
		file: 'src/domain/__fixtures__/imports-infrastructure.ts',
		expectedRule: 'no-restricted-imports',
	},
	{
		name: 'domain may not import vue',
		file: 'src/domain/__fixtures__/imports-vue.ts',
		expectedRule: 'no-restricted-imports',
	},
	{
		name: 'domain may not import node built-ins',
		file: 'src/domain/__fixtures__/imports-node-builtin.ts',
		expectedRule: 'no-restricted-imports',
	},
	{
		name: 'domain may not use raw try/catch (Result discipline)',
		file: 'src/domain/__fixtures__/uses-try-catch.ts',
		expectedRule: 'no-restricted-syntax',
	},
	{
		name: 'application may not use raw try/catch (Result discipline)',
		file: 'src/application/__fixtures__/uses-try-catch.ts',
		expectedRule: 'no-restricted-syntax',
	},
	{
		name: 'delete operator is banned project-wide',
		file: 'src/application/__fixtures__/uses-delete-operator.ts',
		expectedRule: 'no-restricted-syntax',
	},
	{
		name: 'UI may not import obsidian',
		file: 'src/ui/__fixtures__/imports-obsidian.ts',
		expectedRule: 'no-restricted-imports',
	},
	{
		name: 'UI may not reach beyond the bridge port',
		file: 'src/ui/__fixtures__/imports-mock-bridge.ts',
		expectedRule: 'no-restricted-imports',
	},
];

describe('ESLint architectural-boundary fixtures', () => {
	// Lint every fixture in a single ESLint pass — the first lint load is
	// expensive (it warms the type-aware project service); doing them all
	// at once keeps the suite fast and avoids per-test timeouts.
	const eslint = new ESLint({
		cwd: projectRoot,
		// Boundary fixtures live under __fixtures__/ which the project config
		// ignores; bypass that here so the API can lint them on demand.
		ignore: false,
	});
	const allFiles = CASES.map((c) => resolve(projectRoot, c.file));
	let resultsByPath: Map<string, ESLint.LintResult>;

	beforeAll(async () => {
		const results = await eslint.lintFiles(allFiles);
		resultsByPath = new Map(results.map((r) => [r.filePath, r]));
	}, 180_000);

	for (const { name, file, expectedRule } of CASES) {
		it(name, () => {
			const fullPath = resolve(projectRoot, file);
			const result = resultsByPath.get(fullPath);
			expect(result, `no result for ${file}`).toBeDefined();
			const ruleIds = result?.messages.map((m) => m.ruleId) ?? [];
			expect(ruleIds).toContain(expectedRule);
		});
	}
});
