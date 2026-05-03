#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const USES_LINE = /^[\s-]*uses:\s*(.+?)\s*$/;
const PINNED_REF = /@[0-9a-f]{40}$/i;

function normalizeUses(value) {
	return value
		.replace(/\r$/, '')
		.replace(/\s+#.*$/, '')
		.trim()
		.replace(/^["']+|["']+$/g, '');
}

const files = readdirSync(WORKFLOW_DIR)
	.filter((file) => /\.ya?ml$/i.test(file))
	.sort();

const violations = [];

for (const file of files) {
	const path = join(WORKFLOW_DIR, file);
	const lines = readFileSync(path, 'utf8').split('\n');

	lines.forEach((line, index) => {
		const match = USES_LINE.exec(line);
		if (!match) return;

		const ref = normalizeUses(match[1]);
		if (ref.startsWith('./') || ref.startsWith('docker://')) return;
		if (PINNED_REF.test(ref)) return;

		violations.push(`${path}:${index + 1}: ${line.trim()}`);
	});
}

if (violations.length > 0) {
	console.error(
		"Unpinned GitHub Actions references found. Every third-party 'uses:' entry must reference a 40-character commit SHA.",
	);
	for (const violation of violations) {
		console.error(`  - ${violation}`);
	}
	process.exit(1);
}

console.log(
	`Verified ${files.length} workflow file${files.length === 1 ? '' : 's'}: all third-party actions are SHA-pinned.`,
);
