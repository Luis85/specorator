#!/usr/bin/env node
/**
 * Artifact smoke check: prove a production build is shippable.
 *
 * Why this exists: `npm run build` produces the release bundle (main.js,
 * styles.css) and the manifest that Obsidian loads, but nothing verified the
 * outputs were present, version-synced, and within a sane size budget. An
 * agent could leave artifacts stale, desync package.json/manifest.json, or
 * balloon the bundle and CI would stay green
 * (docs/tech-debt/2026-06-07-agentic-quality-gates.md).
 *
 * This is a post-build gate: run `npm run build` first (CI does), then this.
 * It does NOT build — keeping it cheap to run repeatedly and easy to reason
 * about in isolation.
 *
 * Checks:
 *   1. main.js, styles.css, manifest.json all exist and are non-empty.
 *   2. package.json version === manifest.json version (release sync).
 *   3. manifest.minAppVersion is present and recorded in versions.json for the
 *      current version.
 *   4. main.js and styles.css stay within the byte budget below. Budgets have
 *      headroom to absorb normal growth but catch an accidental doubling.
 *   5. main.js contains the compiled Vue Library island (its root class name
 *      proves unplugin-vue output survived bundling+minification).
 *   6. styles.css carries the Vue style markers: scoped SFC rules after
 *      VUE_STYLES_MARKER, and the .specorator-vue tokens/reset baseline
 *      before it.
 *
 * Bump a budget deliberately (with a reason in the PR) when a real dependency
 * pushes the bundle up — do not silently raise it to make CI pass.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VUE_STYLES_MARKER } from './mergeVueSfcStyles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MB = 1024 * 1024;
const KB = 1024;

// Measured 2026-06-07: main.js ~2.88 MB (SDK-dominated), styles.css ~145 KB.
const BUDGET = {
  'main.js': Math.round(3.6 * MB),
  'styles.css': Math.round(256 * KB),
};

const errors = [];

function readJson(file) {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
}

function formatBytes(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  return `${(bytes / KB).toFixed(1)} KB`;
}

// 1 + 4: presence + size budget.
for (const [file, maxBytes] of Object.entries(BUDGET)) {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) {
    errors.push(`Missing build artifact: ${file} (run \`npm run build\`).`);
    continue;
  }
  const { size } = statSync(abs);
  if (size === 0) {
    errors.push(`Empty build artifact: ${file}.`);
  } else if (size > maxBytes) {
    errors.push(
      `${file} is ${formatBytes(size)}, over the ${formatBytes(maxBytes)} ` +
        `budget. Trim it, or raise the budget in scripts/check-artifacts.mjs ` +
        `with a reason.`,
    );
  }
}

// 5: the unified Library island must survive bundling+minification: its root
// class name is emitted by LibraryView.onOpen and proves compiled-SFC code
// (unplugin-vue output) reached main.js.
if (existsSync(join(ROOT, 'main.js'))) {
  const mainJs = readFileSync(join(ROOT, 'main.js'), 'utf8');
  if (!mainJs.includes('specorator-library-vue-root')) {
    errors.push('main.js is missing the compiled Vue Library island (specorator-library-vue-root marker).');
  }
}

// 6: SFC styles must actually reach styles.css: scoped rules carry a [data-v-
// attribute selector AFTER the merge marker, and the .specorator-vue
// baseline (tokens/reset via index.css) must sit BEFORE it. The two checks
// catch a dead merge pipeline and a dropped index.css registration
// independently. The baseline check needs both a bare `.specorator-vue`
// selector AND an `--sp-` token: atoms.css alone (`.specorator-vue-*`
// classes) must not satisfy it when tokens/reset were dropped.
if (existsSync(join(ROOT, 'styles.css'))) {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const markerIdx = css.indexOf(VUE_STYLES_MARKER);
  if (markerIdx === -1) {
    errors.push('styles.css is missing the Vue SFC styles marker (mergeVueSfcStyles did not run).');
  } else {
    if (!css.slice(markerIdx + VUE_STYLES_MARKER.length).includes('[data-v-')) {
      errors.push('styles.css has no scoped SFC rules after the Vue marker (SFC style extraction is dead).');
    }
    const before = css.slice(0, markerIdx);
    if (!/\.specorator-vue[\s,{:]/.test(before) || !before.includes('--sp-')) {
      errors.push(
        'styles.css lacks the .specorator-vue tokens/reset baseline before the ' +
          'marker (vue/tokens.css + vue/reset.css registration dropped from index.css).',
      );
    }
  }
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

if (!existsSync(join(ROOT, 'manifest.json'))) {
  errors.push('Missing manifest.json.');
}

// 2: release version sync.
if (manifest.version !== pkg.version) {
  errors.push(
    `Version desync: package.json is ${pkg.version} but manifest.json is ` +
      `${manifest.version}. Run \`npm run version\`.`,
  );
}

// 3: minAppVersion present and recorded.
if (!manifest.minAppVersion) {
  errors.push('manifest.json is missing minAppVersion.');
} else {
  const versions = readJson('versions.json');
  if (versions[manifest.version] === undefined) {
    errors.push(
      `versions.json has no entry for ${manifest.version}. The release flow ` +
        `should map it to a minAppVersion (expected ${manifest.minAppVersion}).`,
    );
  } else if (versions[manifest.version] !== manifest.minAppVersion) {
    errors.push(
      `minAppVersion mismatch for ${manifest.version}: manifest says ` +
        `${manifest.minAppVersion}, versions.json says ` +
        `${versions[manifest.version]}.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Artifact check FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const sizes = Object.keys(BUDGET)
  .map((f) => `${f} ${formatBytes(statSync(join(ROOT, f)).size)}`)
  .join(', ');
console.log(`Artifact check OK: ${sizes}; version ${manifest.version}.`);
