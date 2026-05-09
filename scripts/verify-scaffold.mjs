#!/usr/bin/env node
// @ts-check
// W12 — verify every module directory under src/modules/ has the required scaffold files.
// Usage: npm run verify:scaffold
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from './_utils.mjs';

/**
 * @param {string} name
 * @returns {string}
 */
function toPascalCase(name) {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

/**
 * Returns a list of required scaffold file paths (relative to repoRoot) that are missing.
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export async function verifyScaffold(repoRoot) {
	const modulesDir = path.join(repoRoot, 'src', 'modules');
	const entries = await readdir(modulesDir, { withFileTypes: true });
	const moduleDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

	/** @type {string[]} */
	const missing = [];

	for (const name of moduleDirs) {
		const pascal = toPascalCase(name);
		const required = [
			path.join('src', 'modules', name, `${name}-module.ts`),
			path.join('src', 'modules', name, `${name}-events.ts`),
			path.join('src', 'modules', name, `${pascal}View.vue`),
			path.join('tests', 'modules', name, `${name}-module.test.ts`),
			path.join('tests', 'modules', name, `${pascal}View.po.ts`),
		];
		for (const rel of required) {
			if (!(await pathExists(path.join(repoRoot, rel)))) {
				missing.push(rel);
			}
		}
	}

	return missing;
}

async function main() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(here, '..');
	const missing = await verifyScaffold(repoRoot);
	if (missing.length === 0) {
		console.log('verify:scaffold — all module scaffold files present.');
		return;
	}
	console.error('verify:scaffold — missing required scaffold files:');
	for (const f of missing) {
		console.error(`  missing: ${f}`);
	}
	process.exit(1);
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) {
	await main();
}
