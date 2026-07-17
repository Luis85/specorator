// scripts/tests/obsidian.test.js — Obsidian-plugin mode: options + sub-planners.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { PINNED, planFallow } from '../lib/harness.mjs';
import { obsidianEntry, planObsidian } from '../lib/obsidian.mjs';
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

test('manifest/versions inherit an existing package.json version (brownfield, no check:artifacts desync)', () => {
  const brown = planObsidian(optionsWith(BASE), { packageVersion: '2.3.0' });
  assert.equal(JSON.parse(findWrite(brown, 'manifest.json').content).version, '2.3.0');
  assert.equal(JSON.parse(findWrite(brown, 'versions.json').content)['2.3.0'] !== undefined, true);
  // Greenfield (no package version) falls back to the initial version.
  const green = planObsidian(optionsWith(BASE), {});
  assert.equal(JSON.parse(findWrite(green, 'manifest.json').content).version, '0.1.0');
});

test('brownfield (existing plugin) writes the harness + docs but skips the sample app + tests', () => {
  const actions = planObsidian(optionsWith({ ...BASE, vue: false }), { obsidianAppPresent: true });
  // No sample app sources or sample tests...
  for (const p of ['src/main.ts', 'src/settings.ts', 'src/commands.ts', 'src/core/events/EventBus.ts', 'tests/unit/settings.test.ts', 'tests/unit/eventBus.test.ts']) {
    assert.equal(findWrite(actions, p), undefined, `${p} must not be written on brownfield`);
  }
  // ...but the harness/infra + docs still land.
  for (const p of ['eslint.config.mjs', 'vitest.config.mjs', 'tests/setup.ts', 'tests/__mocks__/obsidian.ts', 'AGENTS.md', '.npmrc']) {
    assert.ok(findWrite(actions, p), `${p} must still be written on brownfield`);
  }
  assert.ok(actions.some((a) => a.type === 'notice' && /Existing plugin detected/.test(a.message)));
});

test('greenfield (empty) writes the full sample app + tests', () => {
  const actions = planObsidian(optionsWith({ ...BASE, vue: false }), {});
  assert.ok(findWrite(actions, 'src/main.ts'));
  assert.ok(findWrite(actions, 'tests/unit/settings.test.ts'));
});

test('a single verify script chains the whole gate set in CI order', () => {
  const pkg = mergedPackagePatch(actionsFor());
  assert.match(pkg.scripts.verify, /lint .*check:quality.*typecheck.*format:check.*build.*check:artifacts/);
});

test('a shadowed verify script surfaces a collision notice (docs point users at it)', () => {
  const actions = actionsFor({}, { scripts: { verify: 'echo mine' } });
  assert.ok(actions.some((a) => a.type === 'notice' && /"verify" script kept/.test(a.message)));
});

test('the i18n scaffold + SessionStart hook ship, with notice text lint-forced through t()', () => {
  const actions = actionsFor();
  const hook = JSON.parse(findWrite(actions, '.claude/settings.json').content);
  assert.ok(hook.hooks.SessionStart, 'missing SessionStart hook');
  for (const p of ['src/i18n/i18n.ts', 'src/i18n/en.json', 'tests/unit/i18n.test.ts']) {
    assert.ok(findWrite(actions, p), `missing ${p}`);
  }
  assert.match(findWrite(actions, 'eslint.config.mjs').content, /Route user-facing notice text through t\(\)/);
});

test('manifest-only brownfield seeds the package version from the manifest (no check:artifacts desync)', () => {
  const state = { obsidianAppPresent: true, obsidianManifest: { version: '3.1.0', minAppVersion: '1.5.0' } };
  const actions = planObsidian(optionsWith(BASE), state);
  const versionPatch = actions.find((a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.version);
  assert.equal(versionPatch.patch.version, '3.1.0');
  assert.equal(JSON.parse(findWrite(actions, 'manifest.json').content).version, '3.1.0');
});

test('obsidianEntry keeps a brownfield entry (root main.ts) and forces src/main.ts on greenfield', () => {
  assert.equal(obsidianEntry(optionsWith(BASE), {}), 'src/main.ts');
  assert.equal(obsidianEntry(optionsWith(BASE), { obsidianAppPresent: true, entry: 'main.ts' }), 'main.ts');
  // a non-src entry lands in the tsconfig include so the type-aware lint resolves it
  const tsconfig = findWrite(planObsidian(optionsWith(BASE), { obsidianAppPresent: true, entry: 'main.ts' }), 'tsconfig.json').content;
  assert.match(tsconfig, /"main\.ts"/);
});

test('VueView pushes the start route before mount (memory history has no initial navigation)', () => {
  const vueView = findWrite(actionsFor({ vue: true }), 'src/ui/VueView.ts').content;
  assert.match(vueView, /await router\.push\('\/'\)/);
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

// --- core services ----------------------------------------------------------

test('both variants scaffold the core services, command wiring, and the typed event map', () => {
  for (const variant of [{ vue: true }, { vue: false }]) {
    const actions = actionsFor(variant);
    for (const p of [
      'src/core/commands/CommandsService.ts',
      'src/core/events/EventBus.ts',
      'src/core/events/AppEvents.ts',
      'src/core/notices/NoticeService.ts',
      'src/core/modals/ModalService.ts',
      'src/core/logging/Logger.ts',
      'src/core/settings/SettingsService.ts',
      'src/core/vault/VaultService.ts',
      'src/core/http/RequestService.ts',
      'src/commands.ts',
      'src/ui/statusBar.ts',
      'tests/unit/eventBus.test.ts',
      'tests/unit/noticeService.test.ts',
      'tests/unit/modalService.test.ts',
      'tests/unit/commandsService.test.ts',
      'tests/unit/statusBar.test.ts',
      'tests/unit/logger.test.ts',
      'tests/unit/settingsService.test.ts',
      'tests/unit/vaultService.test.ts',
      'tests/unit/requestService.test.ts',
    ]) {
      assert.ok(findWrite(actions, p), `missing ${p} (vue: ${variant.vue})`);
    }
  }
});

test('main.ts is orchestration-only: it delegates registration, no inline addCommand', () => {
  const vue = findWrite(actionsFor({ vue: true }), 'src/main.ts').content;
  assert.match(vue, /registerCommands\(this\)/);
  assert.match(vue, /registerStatusBar\(this\)/);
  assert.match(vue, /registerViews\(this\)/);
  assert.doesNotMatch(vue, /addCommand/);
  // The vue open-view command lives in commands.ts, not main.ts.
  const commands = findWrite(actionsFor({ vue: true }), 'src/commands.ts').content;
  assert.match(commands, /open-view/);
  const noVue = findWrite(actionsFor({ vue: false }), 'src/main.ts').content;
  assert.doesNotMatch(noVue, /registerViews/);
});

test('raw `new Notice()` is lint-banned in src, with the NoticeService file exempt', () => {
  const eslint = findWrite(actionsFor(), 'eslint.config.mjs').content;
  assert.match(eslint, /NewExpression\[callee\.name="Notice"\]/);
  assert.match(eslint, /src\/core\/notices\/NoticeService\.ts/);
});

test('the fallow config declares main/core/ui boundary zones with core kept leaf-ward', () => {
  const action = planFallow(optionsWith(BASE), { entry: 'src/main.ts' }).find(
    (a) => a.path === '.fallowrc.json',
  );
  const rc = JSON.parse(action.content);
  const zoneNames = rc.boundaries.zones.map((z) => z.name);
  for (const z of ['main', 'core', 'ui']) assert.ok(zoneNames.includes(z), `missing zone ${z}`);
  const core = rc.boundaries.rules.find((r) => r.from === 'core');
  assert.deepEqual(core.allow, []);
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

test('desktop build externalizes node builtins + electron; mobile externalizes neither (an accidental import must fail the build)', () => {
  const desktop = findWrite(actionsFor({ mobile: false }), 'esbuild.config.mjs').content;
  assert.match(desktop, /builtinModules/);
  assert.match(desktop, /'electron',/);
  const mobile = findWrite(actionsFor({ mobile: true }), 'esbuild.config.mjs').content;
  assert.doesNotMatch(mobile, /builtinModules/);
  assert.doesNotMatch(mobile, /'electron'/);
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

test('release workflow and PR template are written only with github.integrate', () => {
  const withGh = planObsidian(
    { ...optionsWith(BASE), github: { integrate: true } },
    {},
  );
  assert.ok(findWrite(withGh, '.github/workflows/release.yml'));
  assert.ok(findWrite(withGh, '.github/pull_request_template.md'));
  assert.equal(findWrite(actionsFor(), '.github/workflows/release.yml'), undefined);
  assert.equal(findWrite(actionsFor(), '.github/pull_request_template.md'), undefined);
});

test('AGENTS.md is scaffolded and the ADR seed follows the docs.scaffold gate', () => {
  const withDocs = planObsidian({ ...optionsWith(BASE), docs: { scaffold: true } }, {});
  assert.ok(findWrite(withDocs, 'AGENTS.md'));
  const adr = findWrite(withDocs, 'docs/adr/0001-plugin-architecture-baseline.md');
  assert.ok(adr);
  assert.match(adr.content, /status: accepted/);
  assert.match(adr.content, /desktop-only|mobile-ready/);
  const noDocs = planObsidian({ ...optionsWith(BASE), docs: { scaffold: false } }, {});
  assert.ok(findWrite(noDocs, 'AGENTS.md')); // AGENTS.md is core, not docs-gated
  assert.equal(findWrite(noDocs, 'docs/adr/0001-plugin-architecture-baseline.md'), undefined);
});

test('brownfield script shadowing surfaces a collision notice for every obsidian gate script', () => {
  // mergeJson keeps existing scalars, so a shadowed script means the generated
  // command silently never runs — CI/verify/release then assume the wrong tool.
  const scripts = {
    dev: 'old-dev',
    build: 'tsc',
    typecheck: 'tsc -p other',
    version: 'my-hook',
    test: 'jest',
    'format:check': 'other-formatter',
  };
  const actions = actionsFor({}, { scripts });
  for (const name of Object.keys(scripts)) {
    assert.ok(
      actions.some((a) => a.type === 'notice' && a.message.includes(`"${name}" script kept`)),
      `missing collision notice for ${name}`,
    );
  }
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

test('the standdown path still installs the deps its generated vue tests import', () => {
  // The sample tests are written even when the config stands down, so the
  // deps they import must install too — else the tests fail unresolved.
  const pkg = mergedPackagePatch(actionsFor({ vue: true }, { vitestConfig: true }));
  for (const d of ['vitest', 'jsdom', '@vue/test-utils', '@vitejs/plugin-vue']) {
    assert.equal(pkg.devDependencies[d], PINNED[d], `standdown missing ${d}`);
  }
});
