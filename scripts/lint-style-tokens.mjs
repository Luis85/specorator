#!/usr/bin/env node
/**
 * `scripts/lint-style-tokens.mjs` — WS-AUX-9 (T-AUX-337 / T-AUX-340).
 *
 * Style-token + logical-property guard for the agent sidepanel surface. Runs
 * as part of `npm run verify` and as a standalone `lint:style-tokens` script.
 *
 * Scans `.vue` and `.css` files under guarded directories
 * (`src/ui/agent/**`, `src/ui/components/agent/**`) for two failure modes:
 *
 *   (a) Raw Obsidian CSS vars — `var(--background-*)`, `var(--text-*)`,
 *       `var(--interactive-*)` — anywhere except `tokens.css`. The agent
 *       surface MUST consume the `--sp-*` token layer (ADR-AUX-002 /
 *       REQ-AUX-009). Token fallbacks like
 *       `var(--sp-bg-primary, var(--background-primary))` are allowed —
 *       the guard only fires when the raw var is the *first* argument.
 *
 *   (b) Physical-side properties — `margin-left|right`, `padding-left|right`,
 *       `border-(top|bottom)-(left|right)-radius`, `text-align: left|right`,
 *       and bare `left:` / `right:` positioning — instead of their
 *       writing-mode-aware logical equivalents (REQ-AUX-010, NFR-AUX-010).
 *
 * The CLI exits non-zero when any violation is found.
 *
 * Usage (CLI):
 *   node scripts/lint-style-tokens.mjs
 *
 * Programmatic (tests):
 *   const v = await lintStyleTokens(repoRoot, ['src/ui/agent', ...]);
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_GUARDED_DIRS = [
	'src/ui/agent',
	'src/ui/components/agent',
];

/**
 * Raw Obsidian-var patterns. We deliberately scope to the prefixes that the
 * agent surface should not touch directly. Patterns are intentionally NOT
 * anchored to a `var(` opening because `var(--sp-foo, var(--background-bar))`
 * is the supported fallback form — see special-case below.
 */
const OBSIDIAN_VAR_PREFIXES = [
	'--background-',
	'--text-',
	'--interactive-',
];

/**
 * Physical-side property patterns. Each regex captures whole CSS declarations
 * with the property on the LHS so we don't match identifiers/strings.
 */
const PHYSICAL_PROPERTY_PATTERNS = [
	/(^|[\s;{])margin-left\s*:/m,
	/(^|[\s;{])margin-right\s*:/m,
	/(^|[\s;{])padding-left\s*:/m,
	/(^|[\s;{])padding-right\s*:/m,
	/(^|[\s;{])border-top-left-radius\s*:/m,
	/(^|[\s;{])border-top-right-radius\s*:/m,
	/(^|[\s;{])border-bottom-left-radius\s*:/m,
	/(^|[\s;{])border-bottom-right-radius\s*:/m,
	/(^|[\s;{])text-align\s*:\s*(left|right)\b/m,
];

const SCANNED_EXTENSIONS = new Set(['.vue', '.css']);

const FILES_ALLOWED_OBSIDIAN_VARS = new Set([
	// tokens.css declares the `--sp-*` aliases on top of Obsidian vars.
	'tokens.css',
]);

async function walk(dir, out) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (err) {
		if (err && err.code === 'ENOENT') return;
		throw err;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(full, out);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (SCANNED_EXTENSIONS.has(ext)) {
				out.push(full);
			}
		}
	}
}

/**
 * Extract every `<style>` block from a `.vue` source, or return the whole
 * body for `.css`. Other Vue sections (template/script) are excluded so
 * legitimate identifiers like `text-align="left"` template attributes don't
 * trip the guard.
 */
function extractStyleBlocks(filePath, body) {
	if (filePath.endsWith('.css')) return [{ start: 0, body }];
	const blocks = [];
	const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
	let m;
	while ((m = re.exec(body)) !== null) {
		blocks.push({ start: m.index + m[0].indexOf(m[1]), body: m[1] });
	}
	return blocks;
}

function lineNumberAt(body, offset) {
	let line = 1;
	for (let i = 0; i < offset && i < body.length; i += 1) {
		if (body.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

/**
 * Find raw Obsidian var occurrences. Skips the supported fallback form where
 * the Obsidian var appears as the *second* argument inside `var(--sp-X, var(--Y))`.
 */
function findObsidianVars(styleBody, baseOffset, wholeBody) {
	const violations = [];
	for (const prefix of OBSIDIAN_VAR_PREFIXES) {
		// Pattern: var( <maybe-whitespace> --prefix
		const re = new RegExp(`var\\(\\s*${prefix}[a-zA-Z0-9_-]+`, 'g');
		let m;
		while ((m = re.exec(styleBody)) !== null) {
			// Allow fallback form: look backwards for ", " (i.e. we're the 2nd arg).
			const before = styleBody.slice(0, m.index).trimEnd();
			if (before.endsWith(',')) continue;
			violations.push({
				kind: 'obsidian-var',
				match: m[0],
				line: lineNumberAt(wholeBody, baseOffset + m.index),
			});
		}
	}
	return violations;
}

function findPhysicalProperties(styleBody, baseOffset, wholeBody) {
	const violations = [];
	for (const pattern of PHYSICAL_PROPERTY_PATTERNS) {
		const re = new RegExp(pattern.source, 'g');
		let m;
		while ((m = re.exec(styleBody)) !== null) {
			violations.push({
				kind: 'physical-property',
				match: m[0].trim(),
				line: lineNumberAt(wholeBody, baseOffset + m.index),
			});
		}
	}
	return violations;
}

/**
 * Scan the given `repoRoot` for token + RTL violations under `scanDirs`
 * (default: agent surface). Returns a flat list of violation records.
 */
export async function lintStyleTokens(repoRoot, scanDirs = DEFAULT_GUARDED_DIRS) {
	const files = [];
	for (const rel of scanDirs) {
		await walk(path.join(repoRoot, rel), files);
	}

	const violations = [];
	for (const file of files) {
		const body = await readFile(file, 'utf8');
		const basename = path.basename(file);
		const blocks = extractStyleBlocks(file, body);
		for (const block of blocks) {
			if (!FILES_ALLOWED_OBSIDIAN_VARS.has(basename)) {
				for (const v of findObsidianVars(block.body, block.start, body)) {
					violations.push({ ...v, file });
				}
			}
			for (const v of findPhysicalProperties(block.body, block.start, body)) {
				violations.push({ ...v, file });
			}
		}
	}
	return violations;
}

async function main() {
	const repoRoot = path.resolve(__dirname, '..');
	const violations = await lintStyleTokens(repoRoot);
	if (violations.length === 0) {
		console.log('lint-style-tokens: clean (0 violations across guarded paths).');
		return 0;
	}
	console.error(`lint-style-tokens: ${violations.length} violation(s)`);
	const grouped = new Map();
	for (const v of violations) {
		const rel = path.relative(repoRoot, v.file);
		if (!grouped.has(rel)) grouped.set(rel, []);
		grouped.get(rel).push(v);
	}
	for (const [rel, list] of grouped) {
		console.error(`\n  ${rel}`);
		for (const v of list) {
			console.error(`    L${v.line}  [${v.kind}]  ${v.match}`);
		}
	}
	console.error(
		'\n  Fix: replace raw Obsidian vars with --sp-* tokens (ADR-AUX-002) and ' +
			'physical-side properties with their logical equivalents (REQ-AUX-010).',
	);
	return 1;
}

// CLI entrypoint — `import.meta.url` matches `process.argv[1]` only when
// the script is run directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	main().then(
		(code) => {
			process.exit(code);
		},
		(err) => {
			console.error(err);
			process.exit(2);
		},
	);
}
