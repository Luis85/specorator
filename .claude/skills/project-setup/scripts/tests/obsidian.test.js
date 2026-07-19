// scripts/tests/obsidian.test.js — Obsidian-plugin mode: options + sub-planners.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { PINNED, planFallow } from '../lib/harness.mjs';
import { obsidianEntry, planObsidian } from '../lib/obsidian.mjs';
import { loadOptions, OBSIDIAN_NODE_ENGINES } from '../lib/options.mjs';

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
  const versions = JSON.parse(findWrite(actions, 'versions.json').content);
  const manifest = JSON.parse(findWrite(actions, 'manifest.json').content);
  assert.equal(versions[manifest.version], '1.6.7');
  assert.equal(manifest.version, '0.1.0'); // the fixed greenfield initial version
});

test('the scaffold writes the full sample app + tests', () => {
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

test('the i18n scaffold ships by default and notice text is lint-forced through t()', () => {
  const actions = actionsFor();
  for (const p of ['src/i18n/i18n.ts', 'src/i18n/en.json', 'tests/unit/i18n.test.ts']) {
    assert.ok(findWrite(actions, p), `missing ${p}`);
  }
  assert.match(findWrite(actions, 'eslint.config.mjs').content, /Route user-facing notice text through t\(\)/);
});

test('hooks are opt-in: no .claude/settings.json by default; slash commands ship (release gated on GitHub)', () => {
  const actions = actionsFor();
  assert.equal(findMerge(actions, '.claude/settings.json'), undefined, 'no hooks -> no settings.json');
  for (const c of ['add-command', 'add-setting', 'new-service']) {
    assert.ok(findWrite(actions, `.claude/commands/${c}.md`), `missing slash command ${c}`);
  }
  // /release assumes the tag-push workflow (planRelease), so it ships only with
  // GitHub integration — not in the default github-off scaffold.
  assert.equal(findWrite(actions, '.claude/commands/release.md'), undefined, 'release must be gated off without github');
  assert.ok(findWrite(planWithGithub(), '.claude/commands/release.md'), 'release should ship with github');
  // Opting in wires SessionStart (deps install) and a qualityGate Stop hook,
  // merged (not written) so it survives an existing .claude/settings.json.
  const merge = findMerge(optionsForHooks({ sessionStart: true, qualityGate: true }), '.claude/settings.json');
  assert.ok(merge.patch.hooks.SessionStart, 'missing SessionStart hook');
  assert.ok(merge.patch.hooks.Stop, 'missing qualityGate Stop hook');
  assert.match(merge.patch.hooks.Stop[0].hooks[0].command, /typecheck.*lint/);
  // Neither on -> still no settings.json.
  assert.equal(findMerge(optionsForHooks({}), '.claude/settings.json'), undefined);
});

// The .claude/settings.json merge for a hooks config, given an existing settings
// file (state.claudeSettings) and optional extra answers (e.g. packageManager).
function claudeMergeWith(hooks, state = {}, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'obs-hk-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, hooks, ...extra }));
  try {
    return findMerge(planObsidian(loadOptions(path), state), '.claude/settings.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const npmSession = { hooks: [{ type: 'command', command: 'npm install' }] };
// What a prior apply recorded — reconciliation keys ownership on this, not command text.
const priorNpm = { hooks: { sessionStart: true }, packageManager: 'npm' };

test('re-applying an unchanged hook is a no-op (reconcile leaves settings.json untouched)', () => {
  const state = { claudeSettings: { hooks: { SessionStart: [npmSession] } }, priorOptions: priorNpm };
  assert.equal(claudeMergeWith({ sessionStart: true }, state), undefined);
});

test('a package-manager change replaces the stale install hook instead of unioning it', () => {
  const state = { claudeSettings: { hooks: { SessionStart: [npmSession] } }, priorOptions: priorNpm };
  const merge = claudeMergeWith({ sessionStart: true }, state, { packageManager: 'pnpm' });
  // Only pnpm install remains — not both npm and pnpm (which would race lockfiles).
  assert.deepEqual(merge.patch.hooks.SessionStart, [
    { hooks: [{ type: 'command', command: 'pnpm install' }] },
  ]);
  assert.ok(merge.force?.includes('hooks'), 'must force-replace hooks, not deep-merge (union) them');
});

test('toggling a hook off removes the previously generated hook', () => {
  const state = { claudeSettings: { hooks: { SessionStart: [npmSession] } }, priorOptions: priorNpm };
  const merge = claudeMergeWith({ sessionStart: false }, state);
  assert.equal(merge.patch.hooks.SessionStart, undefined, 'the stale SessionStart hook should be gone');
});

test('reconcile preserves the user\'s own hooks while swapping ours', () => {
  const userHook = { hooks: [{ type: 'command', command: 'echo custom' }] };
  const state = { claudeSettings: { hooks: { SessionStart: [userHook, npmSession] } }, priorOptions: priorNpm };
  const merge = claudeMergeWith({ sessionStart: true }, state, { packageManager: 'pnpm' });
  assert.deepEqual(merge.patch.hooks.SessionStart, [
    userHook,
    { hooks: [{ type: 'command', command: 'pnpm install' }] },
  ]);
});

test('a user hook sharing a command is NOT removed on a first apply (nothing is ours yet)', () => {
  // No priorOptions → the byte-exact ownership match finds nothing of ours, so a
  // user's own `npm install` hook survives even with the option disabled — the exact
  // false positive command-only matching had.
  const state = { claudeSettings: { hooks: { SessionStart: [npmSession] } } };
  assert.equal(claudeMergeWith({ sessionStart: false }, state), undefined);
});

test('a multi-hook user entry sharing a command is not deleted wholesale', () => {
  // Our prior entry is a single-command hook; a user entry that also runs a second
  // command is a different shape, so byte-exact matching keeps it untouched.
  const multi = { hooks: [{ type: 'command', command: 'npm install' }, { type: 'command', command: 'echo hi' }] };
  const state = { claudeSettings: { hooks: { SessionStart: [multi] } }, priorOptions: priorNpm };
  assert.equal(claudeMergeWith({ sessionStart: false }, state), undefined);
});

// planObsidian actions with all guardrails on and a given detect state.
function planWithState(state, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'obs-st-'));
  const path = join(dir, 'answers.json');
  writeFileSync(
    path,
    JSON.stringify({
      obsidian: BASE,
      github: { integrate: true },
      guardrails: { fallowRatchet: true, eslintSeverityStaging: true, locGuard: true, coverageFloors: true, ci: true, cssGuard: true },
      docs: { scaffold: true },
      ...extra,
    }),
  );
  try {
    return planObsidian(loadOptions(path), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const hasNotice = (actions, re) => actions.some((a) => a.type === 'notice' && re.test(a.message));

test('an existing .npmrc missing tag-version-prefix is flagged (release tag would mismatch)', () => {
  assert.ok(hasNotice(planWithState({ npmrc: 'registry=https://example.test\n' }), /tag-version-prefix/));
  // A .npmrc that already sets it (e.g. our own) is not flagged.
  assert.ok(!hasNotice(planWithState({ npmrc: 'tag-version-prefix=""\n' }), /tag-version-prefix/));
  assert.ok(!hasNotice(planWithState({}), /tag-version-prefix/));
});

test('disabling pre-commit on re-apply warns that the installed git hook stays active', () => {
  // Prior apply had preCommit on; now off → apply can't uninstall the git hook, so warn.
  assert.ok(hasNotice(planWithState({ priorOptions: { hooks: { preCommit: true } } }, { hooks: { preCommit: false } }), /git hook/));
  // First apply (no prior pre-commit) → nothing installed, no warning.
  assert.ok(!hasNotice(planWithState({}, { hooks: { preCommit: false } }), /git hook/));
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

test('eslint-plugin-obsidianmd\'s exact @eslint/json peer is provided at the root (strict-peer/PnP)', () => {
  // obsidianmd@0.4.1 declares peerDependencies['@eslint/json'] === '0.14.0' and
  // imports it; node_modules PMs resolve it transitively, but Yarn PnP needs the
  // consumer to declare it, or the generated config fails to load before any rule
  // runs. Provide it as a root devDep pinned to that exact peer.
  assert.equal(mergedPackagePatch(actionsFor()).devDependencies['@eslint/json'], '0.14.0');
});

test('the generated Node engine floor matches the pinned toolchain (jsdom/vite)', () => {
  // jsdom (always installed for the vitest DOM env) needs ^22.13.0 on the 22 line
  // and vite (Vue lane) needs >=22.12.0; a >=22 floor would let a package manager
  // pick a Node the pinned toolchain rejects at install/test time.
  const pkg = actionsFor().find(
    (a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.engines,
  );
  // jsdom skips the 23.x line (^20.19 || ^22.13 || >=24), so a bare >=22.13 would
  // wrongly advertise Node 23 — the engines field is the real range union.
  assert.equal(pkg.patch.engines.node, '^22.13.0 || >=24.0.0');
  // Single-sourced from OBSIDIAN_NODE_ENGINES, which hostNodeProblem also enforces on
  // the host runtime — so the advertised range and the enforced one can never drift.
  assert.equal(pkg.patch.engines.node, OBSIDIAN_NODE_ENGINES);
});

test('manifest-beta.json ships mirroring manifest.json (BRAT-ready), and the publishing guide lands', () => {
  const actions = actionsFor();
  assert.equal(findWrite(actions, 'manifest-beta.json').content, findWrite(actions, 'manifest.json').content);
  const pub = findWrite(actions, 'docs/publishing.md');
  assert.match(pub.content, /BRAT/);
  assert.match(pub.content, /obsidian-releases/);
});

test('npm version delegates to sync-version.mjs, which stages the beta manifest only when present', () => {
  // The version script runs sync-version (no inline `git add`); sync-version stages
  // exactly the files it wrote, so a user who deleted manifest-beta.json can still
  // cut a release — an unconditional `git add manifest-beta.json` would abort (exit 128).
  const pkg = actionsFor().find(
    (a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.scripts?.version,
  );
  assert.equal(pkg.patch.scripts.version, 'node scripts/sync-version.mjs');
  const sync = findWrite(actionsFor(), 'scripts/sync-version.mjs').content;
  assert.match(sync, /const staged = \['manifest\.json', 'versions\.json'\]/);
  assert.match(sync, /if \(existsSync\('manifest-beta\.json'\)\)/);
  assert.match(sync, /staged\.push\('manifest-beta\.json'\)/);
  assert.match(sync, /execFileSync\('git', \['add', \.\.\.staged\]/);
  // git add only inside a repo — the greenfield empty-dir case has no .git, where an
  // unconditional `git add` would exit 128 after the version was already bumped.
  assert.match(sync, /rev-parse.*--is-inside-work-tree/);
  assert.match(sync, /if \(inGitRepo\) execFileSync\('git', \['add'/);
});

test('the verify script is force-replaced so a re-apply refreshes it after option changes', () => {
  // verify is a computed chain of the enabled gates + PM prefix; deepMerge would keep
  // a stale base scalar, so a toggled-off guardrail or a PM switch would leave it wrong.
  const action = actionsFor().find((a) => a.type === 'mergeJson' && a.patch.scripts?.verify);
  assert.ok(action.force?.includes('scripts.verify'), 'verify must be force-replaced, not deep-merged');
});

test('the pre-commit staged-source task covers .mts/.cts and is force-refreshed (only that key)', () => {
  const SOURCE_GLOB = '*.{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs}';
  const action = optionsForHooks({ preCommit: true }).find((a) => a.type === 'mergeJson' && a.patch['nano-staged']);
  assert.ok(SOURCE_GLOB in action.patch['nano-staged'], 'the source glob must cover .mts/.cts module forms');
  // Force ONLY the source-glob value, not the whole objects, so a user's own
  // simple-git-hooks entry or extra nano-staged pattern survives a re-apply.
  assert.deepEqual(action.force, [`nano-staged.${SOURCE_GLOB}`]);
});

test('turning github off on re-apply warns the release workflow remains (declarative apply can\'t delete it)', () => {
  const actions = actionsFor({}, { priorOptions: { github: { integrate: true } } });
  assert.ok(actions.some((a) => a.type === 'notice' && /release\.yml remains/.test(a.message)));
  // First apply (no prior github) → no notice.
  assert.ok(!actionsFor({}, {}).some((a) => a.type === 'notice' && /release\.yml remains/.test(a.message)));
});

test('turning github off on re-apply warns the /release command remains (it would mislead the agent)', () => {
  // github off now but prior on → the skip-if-exists .claude/commands/release.md stays,
  // still pointing at the absent workflow. Warn (apply can't delete it), and don't rewrite it.
  const actions = actionsFor({}, { priorOptions: { github: { integrate: true } } });
  assert.ok(actions.some((a) => a.type === 'notice' && /release\.md remains/.test(a.message)));
  assert.equal(findWrite(actions, '.claude/commands/release.md'), undefined, 'not re-written when github is off');
  // First apply (no prior github) → no stale notice.
  assert.ok(!actionsFor({}, {}).some((a) => a.type === 'notice' && /release\.md remains/.test(a.message)));
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

test('turning github off on re-apply warns the dependabot config remains (like the release workflow)', () => {
  // github now off but a prior apply had it on → the retained dependabot.yml keeps
  // opening weekly PRs, so warn to delete it (a file deletion can't be reconciled).
  const actions = actionsFor({}, { priorOptions: { github: { integrate: true } } });
  assert.ok(actions.some((a) => a.type === 'notice' && /dependabot\.yml remains/.test(a.message)));
  assert.equal(findWrite(actions, '.github/dependabot.yml'), undefined); // nothing re-written
  // First apply (no prior github) → no stale notice.
  assert.ok(!actionsFor({}, {}).some((a) => a.type === 'notice' && /dependabot\.yml remains/.test(a.message)));
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

test('pre-commit runs eslint --fix only when linting is on (no doomed hook when lint is off)', () => {
  const sourceGlob = '*.{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs}';
  // Default (severity-staging on): eslint installed -> eslint --fix + prettier.
  const on = optionsForHooks({ preCommit: true }).find((a) => a.patch?.['nano-staged']);
  assert.deepEqual(on.patch['nano-staged'][sourceGlob], ['eslint --fix', 'prettier --write']);
  // Lint off: planObsidianEslint installs no eslint, so the hook must be prettier-only
  // (else `npx nano-staged` runs a missing eslint on every commit).
  const dir = mkdtempSync(join(tmpdir(), 'obs-pc-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify({ obsidian: BASE, hooks: { preCommit: true }, guardrails: { eslintSeverityStaging: false } }));
  try {
    const actions = planObsidian(loadOptions(path), {});
    const off = actions.find((a) => a.patch?.['nano-staged']);
    assert.deepEqual(off.patch['nano-staged'][sourceGlob], ['prettier --write']);
    // The advisory notice matches the actual toolchain (no phantom "eslint --fix").
    assert.ok(actions.some((a) => a.type === 'notice' && /staged files get prettier before/.test(a.message)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('obsidianEntry is the fixed greenfield entry, and esbuild bundles it (explicitly relative)', () => {
  assert.equal(obsidianEntry(), 'src/main.ts');
  assert.match(findWrite(actionsFor(), 'esbuild.config.mjs').content, /entryPoints: \['\.\/src\/main\.ts'\]/);
});

test('the dev esbuild config splits .env.local CRLF-safely (no dropped OBSIDIAN_VAULT on Windows)', () => {
  // Splitting a CRLF .env.local on bare \n left a trailing \r that the anchored
  // assignment regex rejected, so OBSIDIAN_VAULT never set and the dev build
  // silently skipped deploying to the test vault. Split on /\r?\n/ instead.
  const cfg = findWrite(actionsFor(), 'esbuild.config.mjs').content;
  assert.match(cfg, /readFileSync\('\.env\.local', 'utf8'\)\.split\(\/\\r\?\\n\/\)/);
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

test('CLAUDE.md release flow matches github integration (no phantom workflow when off)', () => {
  // github on: describe the tag-push automation planRelease actually generated.
  const on = findWrite(planWithGithub(), 'CLAUDE.md').content;
  assert.match(on, /git push --follow-tags/);
  assert.match(on, /triggers the release workflow/);
  // github off (default): manual path only — no claim that a workflow runs.
  const off = findWrite(actionsFor(), 'CLAUDE.md').content;
  assert.doesNotMatch(off, /git push --follow-tags/);
  assert.doesNotMatch(off, /triggers the release workflow/);
  assert.match(off, /no release workflow/);
  assert.match(off, /docs\/publishing\.md/); // points at the manual guide instead
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

test('scaffold sources are skip-if-exists (re-apply never clobbers user edits)', () => {
  // Engine-owned files overwrite-backup so a re-apply picks up template updates:
  // the ratchet/build scripts under scripts/, the marker-identified eslint/esbuild
  // configs, and the tsconfig (the sample app needs its alias/includes). Everything
  // else — sources, docs, and vitest.config (it stores the baselined coverage floor,
  // so an overwrite would reset the gate) — is skip-if-exists.
  const overwriteOwned = ['eslint.config.mjs', 'esbuild.config.mjs', 'tsconfig.json'];
  const engineOwned = (p) => p.startsWith('scripts/') || overwriteOwned.includes(p);
  for (const a of actionsFor()) {
    if (a.type !== 'writeFile' || engineOwned(a.path)) continue;
    assert.equal(a.mode, 'skip-if-exists', `${a.path} must be skip-if-exists`);
  }
  for (const p of overwriteOwned) {
    assert.equal(findWrite(actionsFor(), p).mode, 'overwrite-backup', `${p} is engine-owned (overwrite-backup)`);
  }
  // vitest.config holds the applyCoverageFloor baseline — overwriting it on re-apply
  // would silently reset the coverage gate to 0.
  assert.equal(findWrite(actionsFor(), 'vitest.config.mjs').mode, 'skip-if-exists');
});

test('vitest coverage include covers src/** across JS/TS/Vue extensions', () => {
  assert.match(findWrite(actionsFor({ vue: true }), 'vitest.config.mjs').content, /include: \['src\/\*\*\/\*\.\{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs\}'\]/);
  assert.match(findWrite(actionsFor({ vue: false }), 'vitest.config.mjs').content, /include: \['src\/\*\*\/\*\.\{ts,tsx,mts,cts,js,jsx,mjs,cjs\}'\]/);
});

test('the release workflow fails a tag that disagrees with manifest.version before publishing', () => {
  const release = findWrite(planWithGithub(), '.github/workflows/release.yml');
  assert.ok(release, 'release workflow is written when github integration is on');
  assert.match(release.content, /github\.ref_name/);
  assert.match(release.content, /require\('\.\/manifest\.json'\)\.version/);
  assert.match(release.content, /exit 1/);
});

test('the release workflow is engine-owned: overwritten by default, kept-with-notice when user-owned', () => {
  // Fresh / engine-marked → overwrite-backup, so a re-apply refreshes the package-
  // manager install/run commands (an npm→pnpm switch otherwise leaves a stale `npm ci`).
  assert.equal(findWrite(planWithGithub(), '.github/workflows/release.yml').mode, 'overwrite-backup');
  // A user's own unmarked release.yml (state.releaseWorkflow) is kept — skip-if-exists —
  // with a notice, exactly like ci.yml, rather than being clobbered.
  const actions = planWithGithub({}, { releaseWorkflow: true });
  assert.equal(findWrite(actions, '.github/workflows/release.yml').mode, 'skip-if-exists');
  assert.ok(actions.some((a) => a.type === 'notice' && /release\.yml kept/.test(a.message)));
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

test('package.json version is force-synced to the manifest-owned version (no check:artifacts desync)', () => {
  // Fresh scaffold (no manifest yet): force syncs a possible `npm init` default
  // (1.0.0) to the initial 0.1.0.
  const fresh = actionsFor().find((a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.version);
  assert.ok(fresh.force.includes('version'));
  assert.equal(fresh.patch.version, '0.1.0');
  // Re-apply after `npm version` (manifest bumped, kept by skip-if-exists): package
  // is synced to the EXISTING manifest version, not reset to 0.1.0.
  const reapply = actionsFor({}, { manifestVersion: '0.4.2', manifestExists: true }).find(
    (a) => a.type === 'mergeJson' && a.path === 'package.json' && a.patch.version,
  );
  assert.equal(reapply.patch.version, '0.4.2');
  assert.equal(JSON.parse(findWrite(actionsFor({}, { manifestVersion: '0.4.2', manifestExists: true }), 'manifest.json').content).version, '0.4.2');
});

test('the initial scaffold forces the plugin identity (name/description/main) over npm-init defaults; re-apply keeps name/description', () => {
  // Fresh scaffold (no manifest): npm-init defaults (dir name, empty description,
  // main: index.js) must not shadow the selected identity, so force them.
  const fresh = findMerge(actionsFor(), 'package.json');
  assert.deepEqual([...fresh.force].sort(), ['description', 'main', 'name', 'version']);
  assert.equal(fresh.patch.main, 'main.js');
  // Re-apply (manifest present): name/description are merge-kept so a user's later
  // edits survive; main stays engine-owned (the manifest always points at main.js).
  const reapply = findMerge(actionsFor({}, { manifestVersion: '0.4.2', manifestExists: true }), 'package.json');
  assert.deepEqual([...reapply.force].sort(), ['main', 'version']);
});

test('a re-apply onto a malformed manifest (exists but unparseable version) is NOT treated as fresh', () => {
  // manifestExists true + manifestVersion null (bad/missing version) is still a
  // re-apply: forcing name/description would clobber the user's package.json
  // identity even though the manifest is kept by skip-if-exists. Key on existence.
  const merge = findMerge(actionsFor({}, { manifestExists: true, manifestVersion: null }), 'package.json');
  assert.deepEqual([...merge.force].sort(), ['main', 'version']); // name/description NOT forced
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

test('the CSS !important guard scans src/, with the placeholder rendered', () => {
  const gf = findWrite(actionsFor(), 'scripts/check-css-important.mjs').content;
  assert.match(gf, /const STYLE_ROOTS = \['src'\]\.map/);
  assert.doesNotMatch(gf, /\{\{styleRoots\}\}/); // placeholder is rendered, not shipped
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

test('tsconfig is engine-owned (overwrite-backup, replacing a stray one)', () => {
  // The sample app + tests need the "@/*" alias and src/tests includes, so a stray
  // default tsconfig (e.g. a `tsc --init` "{}") is replaced; a backup is kept.
  assert.equal(findWrite(actionsFor(), 'tsconfig.json').mode, 'overwrite-backup');
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

test('the fallow main boundary zone always includes the scaffold entry files', () => {
  const rc = JSON.parse(
    planFallow(optionsWith(BASE), { entry: 'src/main.ts', entryExists: true }).find((a) => a.path === '.fallowrc.json').content,
  );
  const mainZone = rc.boundaries.zones.find((z) => z.name === 'main');
  for (const p of ['src/main.ts', 'src/settings.ts', 'src/commands.ts']) {
    assert.ok(mainZone.patterns.includes(p), `scaffold entry ${p} is zoned`);
  }
});

test('the fallow config ignores nano-staged (flagged) but not simple-git-hooks (a prepare-script no-op)', () => {
  const rc = JSON.parse(
    planFallow(optionsWith(BASE), { entry: 'src/main.ts', entryExists: true }).find((a) => a.path === '.fallowrc.json').content,
  );
  // nano-staged is referenced only inside the simple-git-hooks config value, never a
  // script, so fallow reports it unused — it must be ignored or CI warns.
  assert.ok(rc.ignoreDependencies.includes('nano-staged'), 'nano-staged must be ignored');
  // simple-git-hooks lives in the `prepare` script, so fallow already sees it used;
  // ignoring it would be dead config that masks a real future regression.
  assert.ok(!rc.ignoreDependencies.includes('simple-git-hooks'), 'simple-git-hooks is used via prepare — no ignore');
});

test('the fallow config ignores src/styles.css (the base stylesheet only esbuild reads)', () => {
  const rc = JSON.parse(
    planFallow(optionsWith(BASE), { entry: 'src/main.ts', entryExists: true }).find((a) => a.path === '.fallowrc.json').content,
  );
  // src/styles.css is read only by esbuild.config.mjs (itself ignored), never imported
  // by the TS graph, so fallow reports it as an unused file and the day-one baseline
  // banks a "delete the base stylesheet" recommendation unless it is ignored here.
  // (The bare `styles.css` pattern only covers the built root output, not the source.)
  assert.ok(rc.ignorePatterns.includes('src/styles.css'), 'src/styles.css must be ignored');
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

test('the formatter writes .prettierrc.json and wires format scripts', () => {
  const actions = actionsFor();
  assert.ok(findWrite(actions, '.prettierrc.json'));
  const pkg = mergedPackagePatch(actions);
  assert.equal(pkg.scripts.format, 'prettier --write .');
  assert.equal(pkg.scripts['format:check'], 'prettier --check .');
});

test('the vue test lane installs the deps its generated tests import (incl. the vite peer)', () => {
  const pkg = mergedPackagePatch(actionsFor({ vue: true }));
  // vite is @vitejs/plugin-vue's peer — needed at the root for strict-peer installs.
  for (const d of ['vitest', 'jsdom', '@vue/test-utils', '@vitejs/plugin-vue', 'vite']) {
    assert.equal(pkg.devDependencies[d], PINNED[d], `missing ${d}`);
  }
});
