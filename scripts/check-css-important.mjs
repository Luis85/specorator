#!/usr/bin/env node
/**
 * CSS `!important` guard: fail when a stylesheet gains new `!important` uses.
 *
 * Why this exists: the Obsidian marketplace validator flags every `!important`
 * ("override styles by increasing selector specificity or using CSS variables").
 * Most of ours are justified host/CodeMirror-6 overrides (see src/style/CLAUDE.md
 * — `!important` is permitted only when overriding Obsidian defaults), but we had
 * no local gate, so new unjustified ones could slip in and only surface at the
 * next submission (see docs/tech-debt/2026-06-26-obsidian-marketplace-review*.md).
 *
 * Policy (a ratchet, not a freeze), mirroring scripts/check-loc.mjs:
 *   - A stylesheet with zero `!important` is always fine.
 *   - A new `!important` in a file not on the baseline fails. Re-scope by
 *     specificity / CSS variables, or earn a baseline entry with a reason.
 *   - Grandfathered files are recorded in scripts/css-important-baseline.json
 *     with the count measured at baseline time. The count may shrink freely but
 *     may NOT grow — existing overrides can only get fewer.
 *   - A baselined file that drops below its recorded count (or is deleted) makes
 *     its entry stale; the guard fails so the baseline stays honest and minimal.
 *
 * `!important` inside CSS comments (`/* ... *\/`) is NOT counted — comments that
 * merely mention the token (e.g. "wins by source order without !important") must
 * not inflate the ratchet.
 *
 * Usage:
 *   node scripts/check-css-important.mjs            # verify (CI + local)
 *   node scripts/check-css-important.mjs --update    # rewrite the baseline
 *   node scripts/check-css-important.mjs --json      # machine-readable on failure
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STYLE_DIR = join(ROOT, 'src', 'style');
const BASELINE_PATH = join(__dirname, 'css-important-baseline.json');

const DEFAULT_REASON =
  'Grandfathered host/CM6 override. Justified per src/style/CLAUDE.md ' +
  '(!important allowed only when overriding Obsidian defaults); shrink only.';

const args = process.argv.slice(2);
const update = args.includes('--update');
const asJson = args.includes('--json');

function toPosix(path) {
  return path.split(sep).join('/');
}

/** Count `!important` occurrences, ignoring CSS comments. */
function countImportant(absPath) {
  const text = readFileSync(absPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return (text.match(/!important/g) ?? []).length;
}

function collectCssFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCssFiles(abs, acc);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      acc.push(abs);
    }
  }
  return acc;
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return { description: '', allowlist: {} };
  }
}

const baseline = readBaseline();

const files = collectCssFiles(STYLE_DIR)
  .map((abs) => ({ path: toPosix(relative(ROOT, abs)), count: countImportant(abs) }))
  .filter((f) => f.count > 0)
  .sort((a, b) => b.count - a.count);

if (update) {
  const allowlist = {};
  for (const { path, count } of files) {
    allowlist[path] = {
      count,
      reason: baseline.allowlist?.[path]?.reason ?? DEFAULT_REASON,
    };
  }
  const next = {
    description:
      'Grandfathered stylesheets using `!important` (comments excluded). ' +
      'Counts may shrink but not grow; a new `!important` in any other file is ' +
      'rejected. Regenerate with `npm run check:css -- --update`.',
    allowlist,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(
    `Updated ${toPosix(relative(ROOT, BASELINE_PATH))}: ` +
      `${files.length} file(s) with !important.`,
  );
  process.exit(0);
}

const allowlist = baseline.allowlist ?? {};
const newFiles = [];
const grown = [];
const seen = new Set();

for (const { path, count } of files) {
  const entry = allowlist[path];
  if (!entry) {
    newFiles.push({ path, count });
    continue;
  }
  seen.add(path);
  if (count > entry.count) {
    grown.push({ path, count, ceiling: entry.count });
  }
}

// Stale entries: allowlisted files now below their recorded count or gone.
const currentByPath = new Map(files.map((f) => [f.path, f.count]));
const stale = Object.keys(allowlist).filter(
  (p) => (currentByPath.get(p) ?? 0) < allowlist[p].count,
);

const problems = [];
if (newFiles.length > 0) {
  problems.push(
    'New `!important` in non-baselined stylesheet(s) — re-scope by specificity ' +
      'or CSS variables, or allowlist with a reason in ' +
      'scripts/css-important-baseline.json:',
  );
  for (const { path, count } of newFiles) problems.push(`  ${count}  ${path}`);
}
if (grown.length > 0) {
  problems.push('Grandfathered stylesheet(s) gained `!important` (shrink only):');
  for (const { path, count, ceiling } of grown) {
    problems.push(`  ${count} (was ${ceiling})  ${path}`);
  }
}
if (stale.length > 0) {
  problems.push(
    `Stale baseline entr${stale.length === 1 ? 'y' : 'ies'} (file now has ` +
      'fewer `!important` or is gone — run `npm run check:css -- --update`):',
  );
  for (const path of stale) problems.push(`  ${path}`);
}

if (problems.length === 0) {
  console.log(
    `CSS !important guard OK: ${seen.size} grandfathered stylesheet(s), ` +
      'no new uses.',
  );
  process.exit(0);
}

if (asJson) {
  console.error(JSON.stringify({ newFiles, grown, stale }, null, 2));
} else {
  console.error('CSS !important guard FAILED:\n' + problems.join('\n'));
}
process.exit(1);
