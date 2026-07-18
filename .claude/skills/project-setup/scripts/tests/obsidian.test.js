// scripts/tests/obsidian.test.js — Obsidian-plugin mode: options + sub-planners.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { entryDir, PINNED, planFallow } from '../lib/harness.mjs';
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

function findMerge(actions, path) {
  return actions.find((a) => a.type === 'mergeJson' && a.path === path);
}

// planObsidian actions for a given opt-in hooks config (all hooks default off).
function optionsForHooks(hooks) {
  const dir = mkdtempSync(join(tmpdir(), 'obs-hooks-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, hooks }));
  try {
    return planObsidian(loadOptions(path), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// planObsidian with github integration on (release/CI sub-planners are gated on it).
function planWithGithub(obsidian = {}, state = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'obs-gh-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: { ...BASE, ...obsidian }, github: { integrate: true } }));
  try {
    return planObsidian(loadOptions(path), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  const versions = findMerge(actions, 'versions.json').patch;
  const manifest = JSON.parse(findWrite(actions, 'manifest.json').content);
  assert.equal(versions[manifest.version], '1.6.7');
});

test('versions.json is reconciled (merge+force) so a kept/stale file gets the current entry', () => {
  // mergeJson preserves historical entries; force fixes a stale minAppVersion for
  // the current version (check:artifacts requires versions[version] === minAppVersion).
  const action = findMerge(actionsFor({ minAppVersion: '1.7.2' }), 'versions.json');
  const manifest = JSON.parse(findWrite(actionsFor({ minAppVersion: '1.7.2' }), 'manifest.json').content);
  assert.equal(action.patch[manifest.version], '1.7.2');
  assert.deepEqual(action.force, [manifest.version]);
});

test('manifest/versions inherit an existing package.json version (brownfield, no check:artifacts desync)', () => {
  const brown = planObsidian(optionsWith(BASE), { packageVersion: '2.3.0' });
  assert.equal(JSON.parse(findWrite(brown, 'manifest.json').content).version, '2.3.0');
  assert.equal(findMerge(brown, 'versions.json').patch['2.3.0'] !== undefined, true);
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

test('verify clears stale coverage immediately before check:quality (fallow ratchet is coverage-absent, like CI)', () => {
  // A prior `test:coverage` leaves ./coverage; fallow reads it and reports
  // coverage-weighted metrics, so `verify` could false-fail while fresh CI passes.
  // runGates clears it in the orchestrator — the generated script must mirror that.
  const verify = mergedPackagePatch(actionsFor()).scripts.verify; // default PM: npm
  assert.match(verify, /rmSync\('coverage',\{recursive:true,force:true\}\)" && npm run check:quality/);
  // Off when the ratchet is off (no check:quality step to protect).
  const dir = mkdtempSync(join(tmpdir(), 'obs-nr-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, guardrails: { fallowRatchet: false } }));
  try {
    const noRatchet = mergedPackagePatch(planObsidian(loadOptions(path), {})).scripts.verify;
    assert.doesNotMatch(noRatchet, /rmSync\('coverage'/);
    assert.doesNotMatch(noRatchet, /check:quality/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a shadowed verify script surfaces a collision notice (docs point users at it)', () => {
  const actions = actionsFor({}, { scripts: { verify: 'echo mine' } });
  assert.ok(actions.some((a) => a.type === 'notice' && /"verify" script kept/.test(a.message)));
});

test('the i18n scaffold ships by default and notice text is lint-forced through t()', () => {
  const actions = actionsFor();
  for (const p of ['src/i18n/i18n.ts', 'src/i18n/en.json', 'tests/unit/i18n.test.ts']) {
    assert.ok(findWrite(actions, p), `missing ${p}`);
  }
  assert.match(findWrite(actions, 'eslint.config.mjs').content, /Route user-facing notice text through t\(\)/);
});

test('hooks are opt-in: no .claude/settings.json by default; slash commands always ship', () => {
  const actions = actionsFor();
  assert.equal(findMerge(actions, '.claude/settings.json'), undefined, 'no hooks -> no settings.json');
  for (const c of ['add-command', 'add-setting', 'new-service', 'release']) {
    assert.ok(findWrite(actions, `.claude/commands/${c}.md`), `missing slash command ${c}`);
  }
  // Opting in wires SessionStart (deps install) and a qualityGate Stop hook,
  // merged (not written) so it survives an existing .claude/settings.json.
  const merge = findMerge(optionsForHooks({ sessionStart: true, qualityGate: true }), '.claude/settings.json');
  assert.ok(merge.patch.hooks.SessionStart, 'missing SessionStart hook');
  assert.ok(merge.patch.hooks.Stop, 'missing qualityGate Stop hook');
  assert.match(merge.patch.hooks.Stop[0].hooks[0].command, /typecheck.*lint/);
  // Neither on -> still no settings.json.
  assert.equal(findMerge(optionsForHooks({}), '.claude/settings.json'), undefined);
});

test('the qualityGate Stop hook omits lint when severity-staging is off (no missing-script failure)', () => {
  // eslintSeverityStaging off => planObsidianEslint writes no `lint` script, so the
  // hook must not run `${run} lint` or every Claude Stop fails on a missing script.
  const dir = mkdtempSync(join(tmpdir(), 'obs-qg-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, hooks: { qualityGate: true }, guardrails: { eslintSeverityStaging: false } }));
  try {
    const cmd = findMerge(planObsidian(loadOptions(path), {}), '.claude/settings.json').patch.hooks.Stop[0].hooks[0].command;
    assert.match(cmd, /typecheck/);
    assert.doesNotMatch(cmd, /\blint\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the obsidian devDependency is pinned to eslint-plugin-obsidianmd\'s exact peer (1.8.7)', () => {
  // obsidianmd@0.4.1 declares peerDependencies.obsidian === "1.8.7", so a newer
  // obsidian pin makes a fresh strict-peer install reject. refresh-pins caps it to
  // that peer range; this guards the pinned value against an accidental bump.
  assert.equal(mergedPackagePatch(actionsFor()).devDependencies.obsidian, '1.8.7');
});

test('manifest-beta.json ships mirroring manifest.json (BRAT-ready), and the publishing guide lands', () => {
  const actions = actionsFor();
  assert.equal(findWrite(actions, 'manifest-beta.json').content, findWrite(actions, 'manifest.json').content);
  const pub = findWrite(actions, 'docs/publishing.md');
  assert.match(pub.content, /BRAT/);
  assert.match(pub.content, /obsidian-releases/);
});

test('npm version stages manifest-beta.json alongside manifest.json (BRAT lockstep)', () => {
  // sync-version.mjs rewrites manifest-beta.json, so the lifecycle script must
  // stage it too — otherwise the version commit ships a stale beta manifest.
  const pkg = actionsFor().find(
    (a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.scripts?.version,
  );
  assert.match(pkg.patch.scripts.version, /git add manifest\.json manifest-beta\.json versions\.json/);
});

test('vitest discovers .test and .spec across JS/TS incl. module forms (.mts/.cts), not just *.test.ts', () => {
  // --passWithNoTests means a repo whose suite is only in tests/*.spec.mts would
  // pass verify/CI without running — the include must cover mts/cts too.
  const vitest = findWrite(actionsFor(), 'vitest.config.mjs').content;
  assert.match(vitest, /include: \['tests\/\*\*\/\*\.\{test,spec\}\.\{ts,mts,cts,tsx,js,jsx,mjs,cjs\}'\]/);
});

test('dependabot ships only with github integration', () => {
  assert.ok(findWrite(planWithGithub(), '.github/dependabot.yml'));
  assert.equal(findWrite(actionsFor(), '.github/dependabot.yml'), undefined);
});

test('pre-commit hook is opt-in (off by default; on wires lint-staged + simple-git-hooks)', () => {
  assert.equal(
    actionsFor().find((a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch['simple-git-hooks']),
    undefined,
  );
  const on = optionsForHooks({ preCommit: true });
  const p = on.find((a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch['nano-staged']);
  assert.ok(p, 'missing nano-staged/simple-git-hooks patch');
  assert.equal(p.patch.scripts.prepare, 'simple-git-hooks');
  assert.equal(p.patch['simple-git-hooks']['pre-commit'], 'npx nano-staged');
  assert.ok(p.patch.devDependencies['simple-git-hooks'] && p.patch.devDependencies['nano-staged']);
  assert.ok(on.some((a) => a.type === 'notice' && /pre-commit/i.test(a.message)));
});

test('pre-commit: a pre-existing simple-git-hooks.pre-commit is flagged (mergeJson keeps it, shadowing nano-staged)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'obs-hook-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, hooks: { preCommit: true } }));
  try {
    const kept = (actions) => actions.some((a) => a.type === 'notice' && /simple-git-hooks\.pre-commit kept/.test(a.message));
    // A differing existing hook -> the generated `npx nano-staged` is shadowed -> warn.
    assert.ok(kept(planObsidian(loadOptions(path), { preCommitHook: 'lint-staged' })), 'expected a kept-hook collision notice');
    // No existing hook -> nothing to shadow -> no collision notice.
    assert.ok(!kept(planObsidian(loadOptions(path), {})));
    // Re-apply of ours (identical hook) -> no false collision.
    assert.ok(!kept(planObsidian(loadOptions(path), { preCommitHook: 'npx nano-staged' })));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a kept sub-5 TypeScript devDependency is flagged (bundler-resolution tsconfig needs 5+)', () => {
  // mergeJson keeps a brownfield devDependencies.typescript and `force` only reaches
  // top-level keys, so an existing 4.x survives and breaks the generated typecheck.
  const hasTsNotice = (state) =>
    actionsFor({}, state).some((a) => a.type === 'notice' && /typescript.*moduleResolution "bundler".*TypeScript 5\+/is.test(a.message));
  assert.ok(hasTsNotice({ typescriptVersion: '^4.9.0' }), 'expected a TS-too-old notice for 4.x');
  assert.ok(hasTsNotice({ typescriptVersion: '4.x' }));
  // 5+, latest/*, or absent (greenfield adds the pin) — no false warning.
  assert.ok(!hasTsNotice({ typescriptVersion: '^5.4.0' }));
  assert.ok(!hasTsNotice({ typescriptVersion: '6.0.3' }));
  assert.ok(!hasTsNotice({ typescriptVersion: 'latest' }));
  assert.ok(!hasTsNotice({}));
  // The notice is advisory — the package.json patch still applies (non-blocking).
  assert.ok(findMerge(actionsFor({}, { typescriptVersion: '^4.9.0' }), 'package.json'));
});

test('a kept pre-0.17 esbuild devDependency is flagged (generated config uses esbuild.context())', () => {
  const hasEsbuildNotice = (state) =>
    actionsFor({}, state).some((a) => a.type === 'notice' && /esbuild.*esbuild\.context\(\).*0\.17\+/is.test(a.message));
  assert.ok(hasEsbuildNotice({ esbuildVersion: '^0.16.0' }), 'expected an esbuild-too-old notice for 0.16.x');
  assert.ok(hasEsbuildNotice({ esbuildVersion: '0.16.17' }));
  // 0.17+, a future 1.x, latest/*, or absent (greenfield adds the pin) — no warning.
  assert.ok(!hasEsbuildNotice({ esbuildVersion: '^0.17.0' }));
  assert.ok(!hasEsbuildNotice({ esbuildVersion: '0.28.1' }));
  assert.ok(!hasEsbuildNotice({ esbuildVersion: '^1.0.0' }));
  assert.ok(!hasEsbuildNotice({ esbuildVersion: 'latest' }));
  assert.ok(!hasEsbuildNotice({}));
});

test('manifest-only brownfield seeds the package version from the manifest (no check:artifacts desync)', () => {
  const state = { obsidianAppPresent: true, obsidianManifest: { version: '3.1.0', minAppVersion: '1.5.0' } };
  const actions = planObsidian(optionsWith(BASE), state);
  const versionPatch = actions.find((a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.version);
  assert.equal(versionPatch.patch.version, '3.1.0');
  assert.equal(JSON.parse(findWrite(actions, 'manifest.json').content).version, '3.1.0');
});

test('obsidianEntry keeps an EXISTING brownfield entry (root main.ts) and forces src/main.ts on greenfield', () => {
  assert.equal(obsidianEntry(optionsWith(BASE), {}), 'src/main.ts');
  const brownState = { obsidianAppPresent: true, entry: 'main.ts', entryExists: true };
  assert.equal(obsidianEntry(optionsWith(BASE), brownState), 'main.ts');
  const brown = planObsidian(optionsWith(BASE), brownState);
  // a non-src entry lands in the tsconfig include so the type-aware lint resolves it
  assert.match(findWrite(brown, 'tsconfig.json').content, /"main\.ts"/);
  // esbuild gets an explicitly-relative entry (a bare specifier is ambiguous)
  assert.match(findWrite(brown, 'esbuild.config.mjs').content, /entryPoints: \['\.\/main\.ts'\]/);
  assert.match(findWrite(actionsFor(), 'esbuild.config.mjs').content, /entryPoints: \['\.\/src\/main\.ts'\]/);
});

test('obsidianEntry rejects a root main.js (the esbuild outfile) — no self-overwrite', () => {
  // A manifest + built main.js (no source): main.js is the OUTPUT, so bundling it
  // into itself fails esbuild. Fall back to src/main.ts instead.
  const state = { obsidianAppPresent: true, entry: 'main.js', entryExists: true };
  assert.equal(obsidianEntry(optionsWith(BASE), state), 'src/main.ts');
});

test('a manifest-only brownfield with no source entry falls back to src/main.ts and warns', () => {
  // detectEntry returns a phantom src/index.ts fallback; entryExists is false.
  const state = { obsidianAppPresent: true, entry: 'src/index.ts', entryExists: false };
  assert.equal(obsidianEntry(optionsWith(BASE), state), 'src/main.ts');
  const actions = planObsidian(optionsWith(BASE), state);
  assert.ok(actions.some((a) => a.type === 'notice' && /No source entry was found/.test(a.message)));
});

test('the docs render with the selected package manager (no hardcoded npm)', () => {
  const opts = { ...optionsWith(BASE), packageManager: 'pnpm' };
  const actions = planObsidian(opts, { packageManager: 'pnpm' });
  const readme = findWrite(actions, 'README.md').content;
  assert.match(readme, /pnpm install/);
  assert.match(readme, /pnpm dev/);
  assert.doesNotMatch(readme, /npm run/);
  assert.match(findWrite(actions, 'CLAUDE.md').content, /pnpm verify/);
});

test('yarn release docs use `npm version` (yarn version skips the sync lifecycle + git tag)', () => {
  const opts = { ...optionsWith(BASE), packageManager: 'yarn' };
  const actions = planObsidian(opts, { packageManager: 'yarn' });
  assert.match(findWrite(actions, 'README.md').content, /npm version patch/);
  assert.match(findWrite(actions, 'CLAUDE.md').content, /npm version patch/);
  assert.doesNotMatch(findWrite(actions, 'README.md').content, /yarn version/);
});

test('CLAUDE.md documents test:coverage only when coverage floors are on (no phantom command)', () => {
  // Default (coverageFloors on): the script exists, so the docs list it.
  assert.match(findWrite(actionsFor(), 'CLAUDE.md').content, /\btest:coverage\b/);
  // Off: planObsidianVitest emits no test:coverage script, so CLAUDE.md must not
  // point at a command that isn't generated.
  const dir = mkdtempSync(join(tmpdir(), 'obs-cov-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, guardrails: { coverageFloors: false } }));
  try {
    assert.doesNotMatch(findWrite(planObsidian(loadOptions(path), {}), 'CLAUDE.md').content, /\btest:coverage\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('VueView pushes the start route before mount (memory history has no initial navigation)', () => {
  const vueView = findWrite(actionsFor({ vue: true }), 'src/ui/VueView.ts').content;
  assert.match(vueView, /await router\.push\('\/'\)/);
});

test('scaffold sources are skip-if-exists (brownfield-safe, never clobbers)', () => {
  // Engine-owned files may overwrite-backup: ratchet/build scripts, and the
  // marker-identified configs (vitest/eslint/esbuild). For those, an unmarked
  // USER config stands down earlier, so reaching the write means it is ours or a
  // replaceable marked generic one. tsconfig.json is greenfield-owned (the sample
  // app needs its alias/includes). Everything else — sources, docs — never
  // clobbers user files.
  const overwriteOwned = ['vitest.config.mjs', 'eslint.config.mjs', 'esbuild.config.mjs', 'tsconfig.json'];
  const engineOwned = (p) => p.startsWith('scripts/') || overwriteOwned.includes(p);
  for (const a of actionsFor()) {
    if (a.type !== 'writeFile' || engineOwned(a.path)) continue;
    assert.equal(a.mode, 'skip-if-exists', `${a.path} must be skip-if-exists`);
  }
  for (const p of overwriteOwned) {
    assert.equal(findWrite(actionsFor(), p).mode, 'overwrite-backup', `${p} is engine-owned (overwrite-backup)`);
  }
});

test('an UNMARKED user eslint/esbuild config stands down (skip-if-exists), never clobbered', () => {
  const withUserEslint = actionsFor({}, { eslintConfigMjs: true });
  assert.equal(findWrite(withUserEslint, 'eslint.config.mjs').mode, 'skip-if-exists');
  assert.ok(withUserEslint.some((a) => a.type === 'notice' && /eslint\.config\.mjs/.test(a.message)));
  assert.equal(findWrite(actionsFor({}, { esbuildConfig: true }), 'esbuild.config.mjs').mode, 'skip-if-exists');
});

test('a boundary-less .fallowrc.json is upgraded to the Obsidian config in obsidian mode (backup kept)', () => {
  const opts = optionsWith(BASE); // obsidian options (BASE carries the obsidian block)
  const upgrade = planFallow(opts, { entry: 'src/main.ts', fallowrcNeedsBoundaries: true });
  const rc = upgrade.find((a) => a.path === '.fallowrc.json');
  assert.equal(rc.mode, 'overwrite-backup');
  assert.ok(upgrade.some((a) => a.type === 'notice' && /boundary zones/.test(a.message)));
  // A config that already has boundaries (ours, or the user's) is left alone.
  const keep = planFallow(opts, { entry: 'src/main.ts', fallowrcNeedsBoundaries: false });
  assert.equal(keep.find((a) => a.path === '.fallowrc.json').mode, 'skip-if-exists');
  assert.ok(!keep.some((a) => a.type === 'notice' && /boundary zones/.test(a.message)));
});

test('generic mode never force-upgrades .fallowrc.json (obsidian-only behavior)', () => {
  // No obsidian block -> even a boundary-less fallowrc stays skip-if-exists.
  const generic = planFallow({ guardrails: { fallowRatchet: true } }, { entry: 'src/index.ts', fallowrcNeedsBoundaries: true });
  assert.equal(generic.find((a) => a.path === '.fallowrc.json').mode, 'skip-if-exists');
});

test('brownfield seeds src/styles.css from an existing root styles.css (no first-build clobber)', () => {
  const state = { obsidianAppPresent: true, entry: 'main.ts', entryExists: true, rootStylesheet: '.card { color: red; }\n' };
  const actions = actionsFor({}, state);
  const styles = findWrite(actions, 'src/styles.css');
  assert.equal(styles.content, '.card { color: red; }\n', 'src/styles.css is seeded from the existing sheet');
  assert.equal(styles.mode, 'skip-if-exists');
  assert.ok(actions.some((a) => a.type === 'notice' && /migrated into src\/styles\.css/.test(a.message)));
});

test('vitest coverage include tracks the entry root and includes JS/TS/Vue extensions', () => {
  // greenfield entry src/main.ts -> src/** (js/jsx included so a brownfield JS
  // plugin is measured; a greenfield TS scaffold has no .js there so it's a no-op).
  assert.match(findWrite(actionsFor({ vue: true }), 'vitest.config.mjs').content, /include: \['src\/\*\*\/\*\.\{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs\}'\]/);
  // brownfield root entry main.ts -> **/* (measuring src/** would false-pass on zero files)
  const bf = findWrite(actionsFor({ vue: false }, { obsidianAppPresent: true, entry: 'main.ts', entryExists: true }), 'vitest.config.mjs').content;
  assert.match(bf, /include: \['\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}'\]/);
});

test('the release workflow fails a tag that disagrees with manifest.version before publishing', () => {
  const release = findWrite(planWithGithub(), '.github/workflows/release.yml');
  assert.ok(release, 'release workflow is written when github integration is on');
  assert.match(release.content, /github\.ref_name/);
  assert.match(release.content, /require\('\.\/manifest\.json'\)\.version/);
  assert.match(release.content, /exit 1/);
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

test('main.ts ./settings import is pre-sorted so lint passes for any plugin name', () => {
  // The SettingTab class name sorts before or after DEFAULT_SETTINGS depending on
  // the plugin name; lint (CI) runs without --fix, so the planner emits members
  // already in simple-import-sort order (en collator, base sensitivity) either way.
  const early = findWrite(actionsFor({ id: 'acme-sync', name: 'Acme Sync' }), 'src/main.ts').content;
  assert.match(early, /\{ AcmeSyncSettingTab, DEFAULT_SETTINGS, migrateSettings \} from '\.\/settings'/);
  const late = findWrite(actionsFor({ id: 'demo-notes', name: 'Demo Notes' }), 'src/main.ts').content;
  assert.match(late, /\{ DEFAULT_SETTINGS, DemoNotesSettingTab, migrateSettings \} from '\.\/settings'/);
});

test('Tier 3 sample ships: SuggestModal picker + ribbon/editor-menu wiring, in both variants', () => {
  for (const vue of [true, false]) {
    const actions = actionsFor({ vue });
    assert.ok(findWrite(actions, 'src/ui/GreetingSuggestModal.ts'), `GreetingSuggestModal missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'src/ui/registerExtras.ts'), `registerExtras missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'tests/unit/registerExtras.test.ts'), `test missing (vue=${vue})`);
    const main = findWrite(actions, 'src/main.ts').content;
    assert.match(main, /import \{ registerExtras \} from '\.\/ui\/registerExtras'/);
    assert.match(main, /registerExtras\(this\)/);
  }
});

test('ribbon + status-bar services ship in core and wire as plugin fields (both variants)', () => {
  for (const vue of [true, false]) {
    const actions = actionsFor({ vue });
    assert.ok(findWrite(actions, 'src/core/ribbon/RibbonService.ts'), `RibbonService missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'src/core/statusbar/StatusBarService.ts'), `StatusBarService missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'tests/unit/ribbonService.test.ts'), `ribbon test missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'tests/unit/statusBarService.test.ts'), `status-bar test missing (vue=${vue})`);
    const main = findWrite(actions, 'src/main.ts').content;
    assert.match(main, /readonly ribbon = new RibbonService\(this\)/);
    assert.match(main, /readonly statusBar = new StatusBarService\(this\)/);
  }
});

test('ErrorService ships in core and onload routes through it (both variants)', () => {
  for (const vue of [true, false]) {
    const actions = actionsFor({ vue });
    assert.ok(findWrite(actions, 'src/core/errors/ErrorService.ts'), `ErrorService missing (vue=${vue})`);
    assert.ok(findWrite(actions, 'tests/unit/errorService.test.ts'), `error test missing (vue=${vue})`);
    const main = findWrite(actions, 'src/main.ts').content;
    assert.match(main, /readonly errors = new ErrorService\(this\.logger, this\.notices\)/);
    assert.match(main, /await this\.errors\.run\(/); // the onload boundary
    // the fallible command demos use it too (no dead API)
    const commands = findWrite(actions, 'src/commands.ts').content;
    assert.match(commands, /plugin\.errors\.wrap\(/);
    assert.match(commands, /plugin\.errors\.run\(/);
    // the clear-greeting checkCallback routes its discarded promise through run()
    // (a post-confirm save failure must notice, not become an unhandled rejection)
    assert.match(commands, /void plugin\.errors\.run\('clear the greeting', \(\) => clearGreeting\(plugin\)\)/);
  }
});

test('the ribbon greeting save awaits through ErrorService before the success notice', () => {
  // A rejected saveSettings must NOT show "greeting set" — persist first inside
  // errors.run, notice only after the await resolves.
  const extras = findWrite(actionsFor(), 'src/ui/registerExtras.ts').content;
  assert.match(extras, /plugin\.errors\.run\('save the greeting', async \(\) => \{/);
  assert.match(extras, /await plugin\.saveSettings\(\{ greeting \}\)/);
  // Ordering: the success notice sits after the awaited save in the same callback.
  const body = extras.slice(extras.indexOf("errors.run('save the greeting'"));
  assert.ok(
    body.indexOf('await plugin.saveSettings') < body.indexOf('notices.info'),
    'the greeting success notice must follow the awaited save',
  );
});

test('menu/timers/vault-event services ship in core, wire as fields, and are demoed (both variants)', () => {
  for (const vue of [true, false]) {
    const actions = actionsFor({ vue });
    for (const p of [
      'src/core/menus/MenuService.ts',
      'src/core/timers/TimersService.ts',
      'src/core/vaultEvents/VaultEventsService.ts',
      'src/ui/registerActivity.ts',
      'tests/unit/menuService.test.ts',
      'tests/unit/timersService.test.ts',
      'tests/unit/vaultEventsService.test.ts',
      'tests/unit/registerActivity.test.ts',
    ]) {
      assert.ok(findWrite(actions, p), `${p} missing (vue=${vue})`);
    }
    const main = findWrite(actions, 'src/main.ts').content;
    assert.match(main, /readonly menus = new MenuService\(this\)/);
    assert.match(main, /readonly timers = new TimersService\(this\)/);
    assert.match(main, /readonly vaultEvents = new VaultEventsService\(this\)/);
    assert.match(main, /registerActivity\(this\)/); // demo consumer wired in onload
    // registerExtras now routes its menus through MenuService (both editor + file)
    const extras = findWrite(actions, 'src/ui/registerExtras.ts').content;
    assert.match(extras, /plugin\.menus\.onEditorMenu\(/);
    assert.match(extras, /plugin\.menus\.onFileMenu\(/);
  }
});

test('class names never reproduce obsidianmd sample identifiers (would fail the lint gate)', () => {
  // A normal name keeps the plain <Name>Plugin convention.
  assert.match(findWrite(actionsFor(), 'src/main.ts').content, /class DemoNotesPlugin extends Plugin/);
  // The default id "my-plugin" pascals back to the banned "MyPlugin"; disambiguate.
  const myMain = findWrite(actionsFor({ id: 'my-plugin', name: 'My Plugin' }), 'src/main.ts').content;
  assert.match(myMain, /class MyAppPlugin extends Plugin/);
  assert.doesNotMatch(myMain, /class MyPlugin extends/);
  // "sample" would collide on the settings tab (SampleSettingTab).
  const sampleSettings = findWrite(actionsFor({ id: 'sample', name: 'Sample' }), 'src/settings.ts').content;
  assert.doesNotMatch(sampleSettings, /SampleSettingTab/);
});

test('a plugin named "Plugin" avoids `class Plugin extends Plugin` (obsidian import clash)', () => {
  // name "Plugin" -> empty base -> would shadow the imported Plugin; disambiguate.
  const main = findWrite(actionsFor({ id: 'plugin', name: 'Plugin' }), 'src/main.ts').content;
  assert.match(main, /class AppPlugin extends Plugin/);
  assert.doesNotMatch(main, /class Plugin extends Plugin/);
});

test('package.json version is force-synced to the manifest-wins version (no check:artifacts desync)', () => {
  // manifest 3.2.1 beats an existing package.json 1.0.0; force syncs package to it.
  const actions = actionsFor({}, { obsidianManifest: { version: '3.2.1' }, packageVersion: '1.0.0' });
  const pkg = actions.find((a) => a.type === 'mergeJson' && a.path === 'package.json');
  assert.deepEqual(pkg.force, ['version']);
  assert.equal(pkg.patch.version, '3.2.1');
});

test('a kept manifest whose isDesktopOnly disagrees with the mobile answer warns', () => {
  const conflict = actionsFor({ mobile: true }, { obsidianManifest: { isDesktopOnly: true, version: '1.0.0' } });
  assert.ok(conflict.some((a) => a.type === 'notice' && /isDesktopOnly/.test(a.message)));
  // Agreement (desktop-only manifest + desktop-only answer) is silent.
  const agree = actionsFor({ mobile: false }, { obsidianManifest: { isDesktopOnly: true, version: '1.0.0' } });
  assert.ok(!agree.some((a) => a.type === 'notice' && /isDesktopOnly/.test(a.message)));
});

test('a brownfield manifest missing isDesktopOnly is reconciled to true for desktop-only mode', () => {
  const findManifestMerge = (actions) =>
    actions.find(
      (a) => a.type === 'mergeJson' && a.path === 'manifest.json' && a.patch.isDesktopOnly === true && (a.force ?? []).includes('isDesktopOnly'),
    );
  // Missing flag + desktop-only answer -> force it true (a kept manifest defaults
  // to mobile-ready in Obsidian, contradicting the build/docs).
  assert.ok(
    findManifestMerge(actionsFor({ mobile: false }, { obsidianManifest: { version: '1.0.0' } })),
    'expected an isDesktopOnly reconcile for a manifest missing the flag',
  );
  // Non-boolean flag is also reconciled (force overwrites the malformed value).
  assert.ok(findManifestMerge(actionsFor({ mobile: false }, { obsidianManifest: { version: '1.0.0', isDesktopOnly: 'yes' } })));
  // Not touched when mobile-ready was chosen (a missing flag already means mobile-ready).
  assert.ok(!findManifestMerge(actionsFor({ mobile: true }, { obsidianManifest: { version: '1.0.0' } })));
  // Not touched when the flag is already an explicit boolean (don't clobber a choice).
  assert.ok(!findManifestMerge(actionsFor({ mobile: false }, { obsidianManifest: { version: '1.0.0', isDesktopOnly: false } })));
  // Greenfield (no existing manifest) writes the flag directly — no reconcile action.
  assert.ok(!findManifestMerge(actionsFor({ mobile: false })));
  // The freshly-generated beta manifest carries the same forced flag (BRAT beta
  // installs must not advertise mobile-ready while the build enforces desktop-only).
  const beta = JSON.parse(findWrite(actionsFor({ mobile: false }, { obsidianManifest: { version: '1.0.0' } }), 'manifest-beta.json').content);
  assert.equal(beta.isDesktopOnly, true);
  // Mobile-ready adopt: beta manifest is not forced desktop-only.
  const betaMobile = JSON.parse(findWrite(actionsFor({ mobile: true }, { obsidianManifest: { version: '1.0.0' } }), 'manifest-beta.json').content);
  assert.notEqual(betaMobile.isDesktopOnly, true);
});

test('an existing .npmrc without tag-version-prefix warns (release tag policy)', () => {
  const warned = planObsidian(optionsWith(BASE), { npmrcNeedsTagPrefix: true });
  assert.ok(warned.some((a) => a.type === 'notice' && /tag-version-prefix/.test(a.message)));
  const clean = planObsidian(optionsWith(BASE), {});
  assert.ok(!clean.some((a) => a.type === 'notice' && /tag-version-prefix/.test(a.message)));
});

test('the src safety/mobile lint globs include JS and module extensions (an adopted JS/module plugin is linted)', () => {
  assert.match(findWrite(actionsFor({ vue: false }), 'eslint.config.mjs').content, /src\/\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}/);
  assert.match(findWrite(actionsFor({ vue: true }), 'eslint.config.mjs').content, /src\/\*\*\/\*\.\{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs\}/);
});

test('the vitest lint-rules block covers every extension the Vitest include runs (no-only reaches a .spec.mts)', () => {
  // A `.ts`-only glob would let `.only`/`.skip` in a tests/foo.spec.mts slip past
  // lint while --passWithNoTests keeps CI green. Must match the Vitest include exts.
  const eslint = findWrite(actionsFor(), 'eslint.config.mjs').content;
  assert.match(eslint, /files: \['tests\/\*\*\/\*\.\{ts,mts,cts,tsx,js,jsx,mjs,cjs\}'\]/);
});

test('the lint safety globs follow the detected source root (brownfield lib/ or root entry)', () => {
  // brownfield entry in lib/ -> lib/** added alongside src/**
  const lib = findWrite(actionsFor({ vue: false }, { obsidianAppPresent: true, entry: 'lib/main.ts', entryExists: true }), 'eslint.config.mjs').content;
  assert.match(lib, /'src\/\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}', 'lib\/\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}'/);
  // brownfield root entry -> a bounded flat-root glob covers the entry's siblings
  // (view.ts, settings.ts, …), not just the entry file
  const root = findWrite(actionsFor({ vue: false }, { obsidianAppPresent: true, entry: 'main.ts', entryExists: true }), 'eslint.config.mjs').content;
  assert.match(root, /'src\/\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}', '\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}'/);
});

test('the CSS !important guard scans the detected source root, not a hardcoded src/', () => {
  const gf = findWrite(actionsFor(), 'scripts/check-css-important.mjs').content;
  assert.match(gf, /const STYLE_ROOTS = \['src'\]\.map/);
  assert.doesNotMatch(gf, /\{\{styleRoots\}\}/); // placeholder is rendered, not shipped
  const lib = findWrite(actionsFor({}, { obsidianAppPresent: true, entry: 'lib/main.ts', entryExists: true }), 'scripts/check-css-important.mjs').content;
  assert.match(lib, /const STYLE_ROOTS = \['src', 'lib'\]\.map/);
  // a root entry scans '.' (bounded by the script's SKIP_DIRS)
  const root = findWrite(actionsFor({}, { obsidianAppPresent: true, entry: 'main.ts', entryExists: true }), 'scripts/check-css-important.mjs').content;
  assert.match(root, /const STYLE_ROOTS = \['\.'\]\.map/);
});

test('the gates cover every accepted source extension, not only plain .ts', () => {
  // tsconfig include: extensionless src/**/* covers every TS extension (a
  // brownfield src/main.tsx/.mts/.cts) — TS globs don't do brace expansion.
  const ts = findWrite(actionsFor(), 'tsconfig.json').content;
  assert.match(ts, /"src\/\*\*\/\*"/);
  assert.match(ts, /"tests\/\*\*\/\*"/);
  assert.doesNotMatch(ts, /\{ts,tsx/); // no unsupported brace glob leaked in
  // eslint base @eslint/js: adopted JS source still gets undefined-var/unused checks.
  const eslint = findWrite(actionsFor(), 'eslint.config.mjs').content;
  assert.match(eslint, /files: \['\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}'\], \.\.\.js\.configs\.recommended/);
  // typescript-eslint typed rules + parser apply to every TS extension, so an
  // adopted .tsx/.mts/.cts parses and gets type-aware + import-sort rules.
  assert.match(eslint, /recommendedTypeChecked\.map\(\(c\) => \(\{/);
  assert.match(eslint, /files: \['\*\*\/\*\.\{ts,tsx,mts,cts\}'\],\s*\n\s*languageOptions/);
});

test('manifest-beta mirrors the KEPT manifest on brownfield adopt (not the answers)', () => {
  // A brownfield plugin whose manifest.json differs from the answers: the beta
  // manifest must describe the adopted plugin, not the scaffold's answer id/name.
  const state = { obsidianAppPresent: true, obsidianManifest: { id: 'their-plugin', name: 'Their Plugin', version: '2.0.0', minAppVersion: '1.5.0', description: 'Theirs', isDesktopOnly: true } };
  const actions = planObsidian(optionsWith(BASE), state);
  const beta = JSON.parse(findWrite(actions, 'manifest-beta.json').content);
  assert.equal(beta.id, 'their-plugin'); // mirrors the kept manifest, not BASE.id
  assert.equal(beta.name, 'Their Plugin');
  // greenfield beta still mirrors the generated manifest (answers)
  const gfBeta = JSON.parse(findWrite(actionsFor(), 'manifest-beta.json').content);
  assert.equal(gfBeta.id, 'demo-notes');
});

test('a kept manifest missing minAppVersion is reconciled so check:artifacts does not desync', () => {
  // brownfield manifest has a version but no minAppVersion -> versions.json would
  // key an entry the manifest lacks; the field is merged into the kept manifest.
  const noMin = planObsidian(optionsWith(BASE), { obsidianAppPresent: true, obsidianManifest: { id: 'x', name: 'X', version: '3.0.0' } });
  const merge = noMin.find((a) => a.type === 'mergeJson' && a.path === 'manifest.json' && a.patch.minAppVersion);
  assert.ok(merge, 'expected a mergeJson filling minAppVersion into the kept manifest');
  assert.ok(JSON.parse(findWrite(noMin, 'manifest-beta.json').content).minAppVersion, 'beta mirror carries minAppVersion too');
  // a manifest that already sets minAppVersion is left untouched
  const withMin = planObsidian(optionsWith(BASE), { obsidianAppPresent: true, obsidianManifest: { id: 'x', version: '3.0.0', minAppVersion: '1.5.0' } });
  assert.equal(withMin.find((a) => a.type === 'mergeJson' && a.path === 'manifest.json' && a.patch.minAppVersion), undefined);
});

test('vitest standdown surfaces a `test` script collision (an existing jest is not silently kept)', () => {
  // Existing vitest config -> the generated config stands down; a stale `test:
  // jest` must be flagged so verify/CI do not silently skip the Vitest lane.
  const state = { obsidianAppPresent: true, vitestConfig: true, scripts: { test: 'jest' } };
  const actions = planObsidian(optionsWith(BASE), state);
  assert.ok(
    actions.some((a) => a.type === 'notice' && /"test" script kept/.test(a.message)),
    'expected a test-script collision notice on the vitest standdown path',
  );
});

test('tsconfig is greenfield-owned (overwrite-backup, replacing a stray one) but kept in brownfield', () => {
  const gf = actionsFor({}, { tsconfigExists: true });
  assert.equal(findWrite(gf, 'tsconfig.json').mode, 'overwrite-backup');
  assert.ok(gf.some((a) => a.type === 'notice' && /tsconfig\.json replaced/.test(a.message)));
  // no existing tsconfig -> still overwrite-backup (writes fresh), but no notice
  assert.ok(!actionsFor().some((a) => a.type === 'notice' && /tsconfig\.json replaced/.test(a.message)));
  // brownfield keeps the user's tsconfig
  assert.equal(findWrite(planObsidian(optionsWith(BASE), { obsidianAppPresent: true }), 'tsconfig.json').mode, 'skip-if-exists');
});

test('a parent-relative entry is rejected everywhere (no build/scan outside the project)', () => {
  // obsidianEntry: even with entryExists true, a `..` entry falls back to src/main.ts.
  const state = { obsidianAppPresent: true, entry: '../shared/main.ts', entryExists: true };
  assert.equal(obsidianEntry(optionsWith(BASE), state), 'src/main.ts');
  // entryDir: a `..` scan root falls back to src.
  assert.equal(entryDir('../shared/main.ts'), 'src');
  assert.equal(entryDir('main.ts'), null); // a real root entry is still fine
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

test('the fallow main boundary zone includes a real detected entry (brownfield root main.ts)', () => {
  const bf = JSON.parse(
    planFallow(optionsWith(BASE), { entry: 'main.ts', entryExists: true }).find((a) => a.path === '.fallowrc.json').content,
  );
  const mainZone = bf.boundaries.zones.find((z) => z.name === 'main');
  assert.ok(mainZone.patterns.includes('main.ts'), 'detected root entry is zoned');
  assert.ok(mainZone.patterns.includes('src/main.ts'), 'scaffold entries still present');
  // A greenfield src/index.ts fallback (does not exist) is NOT zoned.
  const gf = JSON.parse(
    planFallow(optionsWith(BASE), { entry: 'src/index.ts', entryExists: false }).find((a) => a.path === '.fallowrc.json').content,
  );
  assert.ok(!gf.boundaries.zones.find((z) => z.name === 'main').patterns.includes('src/index.ts'));
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
