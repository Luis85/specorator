#!/usr/bin/env node
// @ts-check
// Bundle-size budget gate. Reads byte size of the plugin's main.js (project root)
// and the largest .js chunk under dist-standalone/assets/, then fails if either
// exceeds its budget.
//
// Budgets:
//   Plugin main.js: 4 MB (overridable via PLUGIN_BUDGET_BYTES)
//   Standalone largest JS chunk: 2 MB (overridable via STANDALONE_BUDGET_BYTES)
//
// Usage: npm run verify:bundle-size
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PLUGIN_BUDGET = 4 * 1024 * 1024;
const DEFAULT_STANDALONE_BUDGET = 2 * 1024 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseBudget(raw, fallback) {
	if (raw === undefined || raw === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`Invalid budget value: ${raw}`);
	}
	return n;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatMb(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * @param {string} file
 * @returns {number | null}
 */
function safeFileSize(file) {
	try {
		const s = statSync(file);
		return s.isFile() ? s.size : null;
	} catch {
		return null;
	}
}

/**
 * @param {string} dir
 * @returns {{ file: string; size: number } | null}
 */
function findLargestJs(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	/** @type {{ file: string; size: number } | null} */
	let largest = null;
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.js')) continue;
		const full = path.join(dir, entry.name);
		const size = safeFileSize(full);
		if (size === null) continue;
		if (largest === null || size > largest.size) {
			largest = { file: full, size };
		}
	}
	return largest;
}

const pluginBudget = parseBudget(process.env.PLUGIN_BUDGET_BYTES, DEFAULT_PLUGIN_BUDGET);
const standaloneBudget = parseBudget(
	process.env.STANDALONE_BUDGET_BYTES,
	DEFAULT_STANDALONE_BUDGET,
);

const pluginPath = path.join(repoRoot, 'main.js');
const pluginSize = safeFileSize(pluginPath);

const standaloneAssetsDir = path.join(repoRoot, 'dist-standalone', 'assets');
const largestStandalone = findLargestJs(standaloneAssetsDir);

let failed = false;

if (pluginSize === null) {
	console.error(`FAIL plugin main.js: not found at ${path.relative(repoRoot, pluginPath)}`);
	console.error('     (run `npm run build` first)');
	failed = true;
} else if (pluginSize > pluginBudget) {
	console.error(
		`FAIL plugin main.js: ${formatMb(pluginSize)} exceeds ${formatMb(pluginBudget)} budget`,
	);
	failed = true;
} else {
	console.log(
		`OK   plugin main.js: ${formatMb(pluginSize)} / ${formatMb(pluginBudget)} budget`,
	);
}

if (largestStandalone === null) {
	console.error(
		`FAIL standalone largest JS chunk: no .js files under ${path.relative(
			repoRoot,
			standaloneAssetsDir,
		)}`,
	);
	console.error('     (run `npm run build:web` first)');
	failed = true;
} else {
	const rel = path.relative(repoRoot, largestStandalone.file);
	if (largestStandalone.size > standaloneBudget) {
		console.error(
			`FAIL standalone largest JS chunk (${rel}): ${formatMb(
				largestStandalone.size,
			)} exceeds ${formatMb(standaloneBudget)} budget`,
		);
		failed = true;
	} else {
		console.log(
			`OK   standalone largest JS chunk (${rel}): ${formatMb(
				largestStandalone.size,
			)} / ${formatMb(standaloneBudget)} budget`,
		);
	}
}

if (failed) {
	process.exit(1);
}
