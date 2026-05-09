#!/usr/bin/env node
// @ts-check
// W12 — scaffold a new module skeleton under src/modules/<name>/.
// Usage: npm run scaffold:module -- <module-name>
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from './_utils.mjs';

const NAME_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * @typedef {{ role: 'module' | 'events' | 'view' | 'test' | 'view-po', path: string, contents: string }} ScaffoldFile
 * @typedef {{ created: ReadonlyArray<ScaffoldFile>, skipped: ReadonlyArray<ScaffoldFile> }} ScaffoldResult
 * @typedef {{ repoRoot: string, name: string, log?: (message: string) => void }} ScaffoldOptions
 */

/** @param {unknown} name @returns {boolean} */
export function isValidModuleName(name) {
	return typeof name === 'string' && NAME_REGEX.test(name);
}

/** @param {string} name @returns {string} */
export function toPascalCase(name) {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

/** @param {string} name @returns {string} */
export function toCamelCase(name) {
	const pascal = toPascalCase(name);
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** @param {string} name @returns {string} */
export function renderModuleFile(name) {
	const pascal = toPascalCase(name);
	const camel = toCamelCase(name);
	return `import './${name}-events';
import { defineModule } from '@/modules/module';

export interface ${pascal}Settings {
\treadonly enabled: boolean;
}

const DEFAULTS: ${pascal}Settings = { enabled: true };

export const ${camel}Module = defineModule<${pascal}Settings>({
\tid: '${name}',
\tsettingsKey: '${camel}',
\tsettingsVersion: 1,
\tsettingsDefaults: DEFAULTS,

\tvalidateSettings(raw) {
\t\tconst record = (raw ?? {}) as Record<string, unknown>;
\t\treturn {
\t\t\tenabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULTS.enabled,
\t\t};
\t},

\tmessages: {
\t\ten: { '${name}.title': '${pascal}' },
\t},

\tinit(ports, _settings) {
\t\tports.bus.emit('${name}:initialized', { moduleId: '${name}' });
\t},
});
`;
}

/** @param {string} name @returns {string} */
export function renderEventsFile(name) {
	return `import type {} from '@/domain/shared/event-bus';

declare module '@/domain/shared/event-bus' {
\tinterface EventMap {
\t\t'${name}:initialized': { moduleId: string };
\t}
}
`;
}

/** @param {string} name @returns {string} */
export function renderViewFile(name) {
	return `<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
\t<div data-testid="${name}-view">{{ t('${name}.title') }}</div>
</template>

<style scoped>
/* Module-scoped styles only. Do not add global selectors here. */
</style>
`;
}

/** @param {string} name @returns {string} */
export function renderTestFile(name) {
	const camel = toCamelCase(name);
	return `import { describe, it, expect } from 'vitest';
import { ${camel}Module } from '@/modules/${name}/${name}-module';
import { fakeModulePorts } from '../../__fakes__/fake-ports';

describe('${camel}Module', () => {
\tit('emits ${name}:initialized on init with the correct moduleId', () => {
\t\tconst ports = fakeModulePorts();
\t\tconst received: Array<{ moduleId: string }> = [];
\t\tports.bus.on('${name}:initialized', (envelope) => {
\t\t\treceived.push(envelope.payload);
\t\t});

\t\t${camel}Module.init(ports, { enabled: true });

\t\texpect(received).toHaveLength(1);
\t\texpect(received[0]).toEqual({ moduleId: '${name}' });
\t});
});
`;
}

/** @param {string} name @returns {string} */
export function renderViewPoFile(name) {
	const pascal = toPascalCase(name);
	return `import type { VueWrapper } from '@vue/test-utils'

const TID = {
\troot: '${name}-view',
} as const

export class ${pascal}ViewPageObject {
\tconstructor(private readonly wrapper: VueWrapper) {}

\tprivate byTid(tid: string) {
\t\treturn \`[data-testid="\${tid}"]\`
\t}

\tget root() {
\t\treturn this.wrapper.get(this.byTid(TID.root))
\t}
}
`;
}

/** @param {string} repoRoot @param {string} name @returns {ReadonlyArray<ScaffoldFile>} */
export function plannedFiles(repoRoot, name) {
	return [
		{
			role: 'module',
			path: path.join(repoRoot, 'src', 'modules', name, `${name}-module.ts`),
			contents: renderModuleFile(name),
		},
		{
			role: 'events',
			path: path.join(repoRoot, 'src', 'modules', name, `${name}-events.ts`),
			contents: renderEventsFile(name),
		},
		{
			role: 'view',
			path: path.join(repoRoot, 'src', 'modules', name, `${toPascalCase(name)}View.vue`),
			contents: renderViewFile(name),
		},
		{
			role: 'test',
			path: path.join(repoRoot, 'tests', 'modules', name, `${name}-module.test.ts`),
			contents: renderTestFile(name),
		},
		{
			role: 'view-po',
			path: path.join(repoRoot, 'tests', 'modules', name, `${toPascalCase(name)}View.po.ts`),
			contents: renderViewPoFile(name),
		},
	];
}

/** @param {ScaffoldOptions} options @returns {Promise<ScaffoldResult>} */
export async function scaffoldModule({ repoRoot, name, log = () => {} }) {
	if (typeof name === 'string' && name.endsWith('-module')) {
		const suggestion = name.slice(0, -7);
		throw new Error(
			`Module name must not end with '-module' (the suffix is added automatically). Use '${suggestion}' instead: npm run scaffold:module -- ${suggestion}`,
		);
	}
	if (!isValidModuleName(name)) {
		throw new Error(
			`Invalid module name: ${JSON.stringify(name)}. Use kebab-case, lowercase, ASCII (e.g. 'template-installer').`,
		);
	}

	const files = plannedFiles(repoRoot, name);
	const created = [];
	const skipped = [];

	for (const file of files) {
		if (await pathExists(file.path)) {
			skipped.push(file);
			log(`skip: ${path.relative(repoRoot, file.path)} (already exists)`);
			continue;
		}
		await mkdir(path.dirname(file.path), { recursive: true });
		await writeFile(file.path, file.contents, 'utf8');
		created.push(file);
		log(`create: ${path.relative(repoRoot, file.path)}`);
	}

	return { created, skipped };
}

/** @param {string} name @returns {string} */
export function wiringInstructions(name) {
	const camel = toCamelCase(name);
	const pascal = toPascalCase(name);
	return [
		'',
		'Next steps — wire the module into the registry:',
		'',
		'  1. Edit src/modules/index.ts:',
		`     import { ${camel}Module } from './${name}/${name}-module';`,
		`     export { ${camel}Module };`,
		`     // add ${camel}Module to ALL_MODULES`,
		'',
		'  2. Run the generated test:',
		`     npx vitest run tests/modules/${name}/${name}-module.test.ts`,
		'',
		`  3. If you add a view test, the co-located ${pascal}View.po.ts stub is ready.`,
		'     Elements must be queried by data-testid only — no CSS class or id selectors.',
		'',
		'  4. Document the module in docs/module-authoring.md if it adds new patterns.',
		'',
	].join('\n');
}

function isMain() {
	const entry = process.argv[1];
	if (!entry) return false;
	return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

async function main() {
	const name = process.argv[2];
	if (!name) {
		console.error('Usage: npm run scaffold:module -- <module-name>');
		process.exit(1);
	}
	const here = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(here, '..');
	try {
		const result = await scaffoldModule({
			repoRoot,
			name,
			log: (msg) => console.log(msg),
		});
		console.log(wiringInstructions(name));
		if (result.created.length === 0) {
			console.log('Nothing created — every target file already existed.');
		}
	} catch (err) {
		console.error(`scaffold-module: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

if (isMain()) {
	await main();
}
