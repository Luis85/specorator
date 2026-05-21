#!/usr/bin/env node
/**
 * One-shot codemod for SPEC-MPS-001 §2.1 / ADR-MPS-001.
 *
 * Renames the seven legacy identifiers + the two file-path import
 * specifiers that referenced the old `ClaudeCliPort.ts` and
 * `useClaudeCliPort.ts` modules.
 *
 * The codemod is intentionally simple — `String.prototype.replaceAll`
 * over a fixed token list — so its behaviour is fully predictable and
 * unit-testable. It is idempotent: a second invocation is a no-op
 * because every legacy token has already been replaced.
 *
 * Usage:
 *   node scripts/codemod/rename-claude-cli-port.mjs            # apply
 *   node scripts/codemod/rename-claude-cli-port.mjs --dry-run  # report only
 *
 * Optional positional arguments treat each as a root directory to walk;
 * default is `src/`, `tests/`, `templates/` (relative to cwd).
 *
 * Allow-list: the deprecated re-export shim at
 *   src/ui/composables/useClaudeCliPort.ts
 * is allowed to keep the legacy identifiers in its file name and inside
 * the literal `@deprecated` JSDoc block. The codemod skips that file by
 * path; ESLint enforces no other file slips through.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { argv, cwd, exit } from 'node:process';

/**
 * Substitution list. Order matters: longer tokens (e.g.
 * `ClaudeCliErrorCode`) must come BEFORE shorter ones that share a
 * prefix (`ClaudeCliError`), otherwise a naive replace would chew the
 * longer token into a malformed shorter one + suffix on second pass.
 *
 * The codemod is idempotent because every `before` token does not
 * appear in any `after` token — once a file has been swept, a re-run
 * matches nothing.
 */
export const SUBSTITUTIONS = Object.freeze([
	// Type identifiers (longest-first inside the ClaudeCliError family).
	{ before: 'ClaudeCliStreamOptions', after: 'ChatTransportStreamOptions' },
	{ before: 'ClaudeCliQueryOptions', after: 'ChatTransportQueryOptions' },
	{ before: 'ClaudeCliErrorCode', after: 'ChatTransportErrorCode' },
	{ before: 'ClaudeCliError', after: 'ChatTransportError' },
	{ before: 'ClaudeCliPort', after: 'ChatTransportPort' },
	// Composable function name.
	{ before: 'useClaudeCliPort', after: 'useChatTransportPort' },
	// InjectionKey constant.
	{ before: 'CLAUDE_CLI_PORT', after: 'CHAT_TRANSPORT_PORT' },
]);

/**
 * Import-specifier path substitutions. Cover both the alias form
 * (`@/...`) and the relative form used by sibling files inside the
 * same directory. Plain `import './ClaudeCliPort'` style is not used
 * in the tree but covered defensively.
 */
export const PATH_SUBSTITUTIONS = Object.freeze([
	{ before: '@/domain/ports/ClaudeCliPort', after: '@/domain/ports/ChatTransportPort' },
	{ before: '/domain/ports/ClaudeCliPort', after: '/domain/ports/ChatTransportPort' },
	{ before: './ClaudeCliPort', after: './ChatTransportPort' },
	{ before: '../ports/ClaudeCliPort', after: '../ports/ChatTransportPort' },
	// The composable file. Note the re-export shim keeps the legacy
	// filename; consumers must migrate to the new path.
	{ before: '@/ui/composables/useClaudeCliPort', after: '@/ui/composables/useChatTransportPort' },
	{ before: './useClaudeCliPort', after: './useChatTransportPort' },
]);

/** Files allow-listed to keep the legacy names (the deprecated shim). */
export const ALLOW_LIST = new Set([
	'src/ui/composables/useClaudeCliPort.ts',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.mts', '.cts', '.js', '.mjs']);

const SKIP_DIR_NAMES = new Set([
	'node_modules',
	'.git',
	'.worktrees',
	'dist-plugin',
	'dist-standalone',
	'coverage',
	'storybook-static',
	'docs',
]);

function toPosix(p) {
	return p.split(sep).join('/');
}

function walkDir(root, acc) {
	if (!existsSync(root)) return acc;
	for (const entry of readdirSync(root)) {
		const full = join(root, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry)) continue;
			walkDir(full, acc);
			continue;
		}
		const dotIndex = entry.lastIndexOf('.');
		if (dotIndex < 0) continue;
		const ext = entry.slice(dotIndex);
		if (!SOURCE_EXTENSIONS.has(ext)) continue;
		acc.push(full);
	}
	return acc;
}

/**
 * Apply the substitutions to a single text buffer. Pure: same input ⇒
 * same output. Returns the transformed text and a per-token hit count
 * so tests can assert deterministic behaviour.
 */
export function applySubstitutions(text) {
	let out = text;
	const hits = {};
	for (const { before, after } of SUBSTITUTIONS) {
		// Word-boundary regex so substrings inside larger identifiers do
		// not match (defence in depth — the legacy names are unique
		// enough that bare replaceAll is safe in practice).
		const re = new RegExp(`\\b${escapeRegex(before)}\\b`, 'g');
		const matches = out.match(re);
		if (matches && matches.length > 0) {
			hits[before] = matches.length;
			out = out.replace(re, after);
		}
	}
	for (const { before, after } of PATH_SUBSTITUTIONS) {
		// Path substitutions match anywhere — they are themselves unique
		// enough not to collide with identifiers.
		while (out.includes(before)) {
			out = out.replace(before, after);
			hits[before] = (hits[before] ?? 0) + 1;
		}
	}
	return { text: out, hits };
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk the supplied roots and apply the codemod. Returns a summary the
 * CLI prints. Pure with respect to the filesystem in `--dry-run` mode.
 */
export function runCodemod({ roots, dryRun, repoRoot }) {
	const files = [];
	for (const root of roots) {
		walkDir(root, files);
	}
	const changedFiles = [];
	for (const file of files) {
		const rel = toPosix(relative(repoRoot, file));
		if (ALLOW_LIST.has(rel)) continue;
		const original = readFileSync(file, 'utf8');
		const { text, hits } = applySubstitutions(original);
		if (text === original) continue;
		changedFiles.push({ file: rel, hits });
		if (!dryRun) {
			writeFileSync(file, text);
		}
	}
	return { scanned: files.length, changedFiles };
}

function formatSummary(summary, { dryRun }) {
	const header = dryRun
		? `[dry-run] Would change ${summary.changedFiles.length} file(s) of ${summary.scanned} scanned:`
		: `Updated ${summary.changedFiles.length} file(s) of ${summary.scanned} scanned:`;
	const body = summary.changedFiles
		.map((entry) => {
			const hitsList = Object.entries(entry.hits)
				.map(([token, count]) => `${token}×${count}`)
				.join(', ');
			return `  ${entry.file}  (${hitsList})`;
		})
		.join('\n');
	return body.length > 0 ? `${header}\n${body}` : header;
}

function isMain() {
	const url = import.meta.url;
	const entry = argv[1] ? toPosix(resolve(argv[1])) : '';
	return url.endsWith(toPosix(entry));
}

if (isMain()) {
	const args = argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const positional = args.filter((a) => !a.startsWith('--'));
	const repoRoot = cwd();
	const defaultRoots = ['src', 'tests', 'templates'].map((d) => join(repoRoot, d));
	const roots = positional.length > 0 ? positional.map((d) => resolve(d)) : defaultRoots;
	const summary = runCodemod({ roots, dryRun, repoRoot });
	console.log(formatSummary(summary, { dryRun }));
	exit(0);
}
