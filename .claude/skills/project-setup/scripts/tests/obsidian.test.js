// scripts/tests/obsidian.test.js — Obsidian-plugin mode: options + sub-planners.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { PINNED } from '../lib/harness.mjs';
import { planObsidian } from '../lib/obsidian.mjs';
import { loadOptions } from '../lib/options.mjs';

function optionsWith(obsidian) {
  const dir = mkdtempSync(join(tmpdir(), 'obs-opt-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian }));
  try {
    return loadOptions(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BASE = { id: 'demo-notes', name: 'Demo Notes', description: 'Track demo notes.', author: 'Tester' };

function actionsFor(obsidian = {}, state = {}) {
  return planObsidian(optionsWith({ ...BASE, ...obsidian }), state);
}

function findWrite(actions, path) {
  return actions.find((a) => a.type === 'writeFile' && a.path === path);
}

function mergedPackagePatch(actions) {
  // Several sub-planners patch package.json; fold them like apply() would.
  const patches = actions.filter((a) => a.type === 'mergeJson' && a.path === 'package.json');
  const out = { scripts: {}, dependencies: {}, devDependencies: {} };
  for (const p of patches) {
    Object.assign(out.scripts, p.patch.scripts ?? {});
    Object.assign(out.dependencies, p.patch.dependencies ?? {});
    Object.assign(out.devDependencies, p.patch.devDependencies ?? {});
  }
  return out;
}

// --- options / sanitization ------------------------------------------------

test('loadOptions defaults the obsidian block (vue on, mobile off) and sanitizes the id', () => {
  const o = optionsWith({ id: 'My Plugin!', name: 'My Plugin' }).obsidian;
  assert.equal(o.id, 'my-plugin');
  assert.equal(o.vue, true);
  assert.equal(o.mobile, false);
  assert.match(o.minAppVersion, /^\d+\.\d+\.\d+$/);
});

test('loadOptions strips "obsidian" from the id (marketplace policy) and survives an empty id', () => {
  assert.equal(optionsWith({ id: 'obsidian-tasks' }).obsidian.id, 'tasks');
  assert.equal(optionsWith({ id: '???' }).obsidian.id.length > 0, true);
});

test('loadOptions rejects a malformed minAppVersion (templated into manifest JSON)', () => {
  const o = optionsWith({ ...BASE, minAppVersion: '1.5.0"; bad' }).obsidian;
  assert.match(o.minAppVersion, /^\d+\.\d+\.\d+$/);
});

test('loadOptions leaves obsidian null by default (generic mode unchanged)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'obs-null-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, '{}');
  try {
    assert.equal(loadOptions(path).obsidian, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- manifest --------------------------------------------------------------

test('planObsidian writes a valid manifest.json with isDesktopOnly from the mobile answer', () => {
  const desktop = JSON.parse(findWrite(actionsFor({ mobile: false }), 'manifest.json').content);
  assert.equal(desktop.id, 'demo-notes');
  assert.equal(desktop.name, 'Demo Notes');
  assert.equal(desktop.isDesktopOnly, true);
  const mobile = JSON.parse(findWrite(actionsFor({ mobile: true }), 'manifest.json').content);
  assert.equal(mobile.isDesktopOnly, false);
});

test('manifest fields are JSON-encoded (a crafted name cannot inject manifest keys)', () => {
  const actions = actionsFor({ name: 'Evil", "hacked": true, "x": "' });
  const manifest = JSON.parse(findWrite(actions, 'manifest.json').content);
  assert.equal('hacked' in manifest, false);
  assert.match(manifest.name, /^Evil/);
});

test('versions.json maps the initial version to minAppVersion', () => {
  const actions = actionsFor({ minAppVersion: '1.6.7' });
  const versions = JSON.parse(findWrite(actions, 'versions.json').content);
  const manifest = JSON.parse(findWrite(actions, 'manifest.json').content);
  assert.equal(versions[manifest.version], '1.6.7');
});

test('scaffold sources are skip-if-exists (brownfield-safe, never clobbers)', () => {
  for (const a of actionsFor()) {
    if (a.type !== 'writeFile') continue;
    // Ratchet/build scripts are engine-owned (overwrite-backup); everything
    // else — sources, configs, docs — must never clobber user files.
    if (a.path.startsWith('scripts/')) continue;
    assert.equal(a.mode, 'skip-if-exists', `${a.path} must be skip-if-exists`);
  }
});

// --- vue toggle ------------------------------------------------------------

test('vue mode scaffolds the island (view, router, pinia store, SFCs) and runtime deps', () => {
  const actions = actionsFor({ vue: true });
  for (const p of ['src/ui/VueView.ts', 'src/ui/vue/App.vue', 'src/ui/vue/router.ts', 'src/ui/vue/stores/counter.ts']) {
    assert.ok(findWrite(actions, p), `missing ${p}`);
  }
  const pkg = mergedPackagePatch(actions);
  for (const d of ['vue', 'pinia', 'vue-router']) assert.equal(pkg.dependencies[d], PINNED[d]);
  assert.equal(pkg.scripts.typecheck, 'vue-tsc --noEmit');
});

test('vue:false scaffolds no island and no vue deps; typecheck falls back to tsc', () => {
  const actions = actionsFor({ vue: false });
  assert.equal(actions.some((a) => a.path?.includes('src/ui/vue/')), false);
  const pkg = mergedPackagePatch(actions);
  for (const d of ['vue', 'pinia', 'vue-router']) assert.equal(d in pkg.dependencies, false);
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
});

// --- mobile vs desktop -----------------------------------------------------

test('desktop build externalizes node builtins; mobile does not (an accidental node import must fail the build)', () => {
  const desktop = findWrite(actionsFor({ mobile: false }), 'esbuild.config.mjs').content;
  assert.match(desktop, /builtinModules/);
  const mobile = findWrite(actionsFor({ mobile: true }), 'esbuild.config.mjs').content;
  assert.doesNotMatch(mobile, /builtinModules/);
});

test('mobile mode bans node/electron imports in the eslint config', () => {
  const mobile = findWrite(actionsFor({ mobile: true }), 'eslint.config.mjs').content;
  assert.match(mobile, /no-restricted-imports/);
  assert.match(mobile, /node:\*/);
  const desktop = findWrite(actionsFor({ mobile: false }), 'eslint.config.mjs').content;
  assert.doesNotMatch(desktop, /Mobile-ready/);
});

// --- generated configs -----------------------------------------------------

test('eslint + vitest configs carry the engine marker; vitest thresholds anchor matches coverage.mjs', () => {
  const actions = actionsFor();
  assert.match(findWrite(actions, 'eslint.config.mjs').content, /Generated by project-setup/);
  const vitest = findWrite(actions, 'vitest.config.mjs').content;
  assert.match(vitest, /Generated by project-setup/);
  assert.match(vitest, /thresholds:\s*\{[^}]*\}/); // ANCHOR.vitest in lib/coverage.mjs
});

test('eslint config wires obsidianmd recommended and the raw-HTML injection bans', () => {
  const eslint = findWrite(actionsFor(), 'eslint.config.mjs').content;
  assert.match(eslint, /eslint-plugin-obsidianmd/);
  assert.match(eslint, /configs\.recommended/);
  assert.match(eslint, /innerHTML/);
  assert.match(eslint, /no-console/);
});

test('the sentence-case brand list carries the plugin name as a safe JS literal', () => {
  // No single quote in the name -> prettier-style single-quoted literal with
  // escaped backslash; the embedded double quotes stay inert.
  const plain = findWrite(actionsFor({ name: 'Demo "Notes" \\' }), 'eslint.config.mjs').content;
  assert.ok(plain.includes(`'Demo "Notes" \\\\'`));
  // A single quote in the name -> JSON (double-quoted) encoding, so the quote
  // cannot terminate the literal and inject code.
  const quoted = findWrite(actionsFor({ name: "Demo's Notes" }), 'eslint.config.mjs').content;
  assert.ok(quoted.includes(`"Demo's Notes"`));
  assert.doesNotMatch(quoted, /brands: \[\.\.\.DEFAULT_BRANDS, 'Demo's/);
});

test('all package.json scripts for the gate surface are present', () => {
  const pkg = mergedPackagePatch(actionsFor());
  for (const s of ['dev', 'build', 'test', 'test:coverage', 'lint', 'check:css', 'check:artifacts', 'format', 'format:check', 'version']) {
    assert.ok(pkg.scripts[s], `missing script ${s}`);
  }
});

test('every dependency the obsidian planner emits is pinned (no undefined versions)', () => {
  for (const variant of [{ vue: true }, { vue: false, mobile: true }]) {
    const pkg = mergedPackagePatch(actionsFor(variant));
    for (const [name, version] of [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies)]) {
      assert.match(version ?? '', /^\d+\.\d+\.\d+$/, `unpinned dep ${name} (${version})`);
    }
  }
});

// --- release + collisions --------------------------------------------------

test('release workflow is written only with github.integrate', () => {
  const withGh = planObsidian(
    { ...optionsWith(BASE), github: { integrate: true } },
    {},
  );
  assert.ok(findWrite(withGh, '.github/workflows/release.yml'));
  assert.equal(findWrite(actionsFor(), '.github/workflows/release.yml'), undefined);
});

test('an existing prettier config stands the formatter write down with a notice', () => {
  const actions = actionsFor({}, { prettierConfig: true });
  assert.equal(findWrite(actions, '.prettierrc.json'), undefined);
  assert.ok(actions.some((a) => a.type === 'notice' && /prettier/i.test(a.message)));
});

test('a hand-written vitest/vite config stands the generated config down with a notice', () => {
  const actions = actionsFor({}, { vitestConfig: true });
  assert.equal(findWrite(actions, 'vitest.config.mjs'), undefined);
  assert.ok(actions.some((a) => a.type === 'notice' && /test config/i.test(a.message)));
});
