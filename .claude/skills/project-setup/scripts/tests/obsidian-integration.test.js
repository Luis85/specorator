// scripts/tests/obsidian-integration.test.js — plan()/apply()/verify wiring for obsidian mode.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { apply } from '../lib/apply.mjs';
import { detect } from '../lib/detect.mjs';
import { freezeOptions, loadOptions } from '../lib/options.mjs';
import { plan } from '../lib/plan.mjs';
import { runGates } from '../lib/verify.mjs';
import { tmpProject } from './helpers.js';

const OBSIDIAN = { id: 'demo-notes', name: 'Demo Notes', description: 'Track demo notes.', author: 'Tester' };

function loadFrom(dir, answers) {
  const cfg = join(dir, 'answers.json');
  writeFileSync(cfg, JSON.stringify(answers));
  return loadOptions(cfg);
}

test('plan(): obsidian mode replaces the generic eslint/test planners and retargets fallow at src/main.ts', () => {
  const p = tmpProject({});
  try {
    const options = loadFrom(p.dir, { obsidian: OBSIDIAN, github: { integrate: true } });
    freezeOptions(options, null, detect(p.dir));
    const actions = plan(options, detect(p.dir));
    // Exactly one eslint config — the obsidian one, not the generic staged one.
    const eslintWrites = actions.filter((a) => a.path === 'eslint.config.mjs');
    assert.equal(eslintWrites.length, 1);
    assert.match(eslintWrites[0].content, /obsidianmd/);
    // No jest anywhere; the vitest config is the obsidian lane.
    assert.equal(actions.some((a) => a.path === 'jest.config.mjs'), false);
    assert.equal(actions.filter((a) => a.path === 'vitest.config.mjs').length, 1);
    // Fallow gates the plugin entry, not the generic src/index.ts fallback.
    const rc = actions.find((a) => a.path === '.fallowrc.json');
    assert.match(rc.content, /src\/main\.ts/);
    // Build artifacts are ignored so watch-mode outputs never count as source.
    const gitignore = actions.find((a) => a.type === 'mergeText' && a.path === '.gitignore');
    for (const line of ['main.js', 'styles.css', 'data.json']) {
      assert.ok(gitignore.lines.includes(line), `gitignore missing ${line}`);
    }
    // CI carries the obsidian gate set.
    const ci = actions.find((a) => a.path === '.github/workflows/ci.yml');
    for (const step of ['typecheck', 'check:css', 'build', 'check:artifacts', 'format:check']) {
      assert.match(ci.content, new RegExp(step), `ci missing ${step}`);
    }
  } finally {
    p.cleanup();
  }
});

test('freezeOptions forces vitest + typescript in obsidian mode even when jest is detected', () => {
  const p = tmpProject({ 'package.json': { name: 'x', devDependencies: { jest: '30.0.0' } } });
  try {
    const options = loadFrom(p.dir, { obsidian: OBSIDIAN });
    freezeOptions(options, null, detect(p.dir));
    assert.equal(options.testFramework, 'vitest');
    assert.equal(options.typescript, true);
  } finally {
    p.cleanup();
  }
});

test('greenfield apply: full scaffold lands, second apply converges to a no-op', () => {
  const p = tmpProject({});
  try {
    const answers = { obsidian: OBSIDIAN, github: { integrate: false }, docs: { scaffold: true }, hooks: { sessionStart: true, qualityGate: true } };
    const run = () => {
      const options = loadFrom(p.dir, answers);
      const state = detect(p.dir);
      // Read the prior report as the frozen source, exactly like cli() does —
      // so the greenfield decision survives the post-write detection flip.
      const reportPath = join(p.dir, 'project-setup.report.json');
      const prior = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
      freezeOptions(options, prior?.options, state);
      return apply(plan(options, state), { cwd: p.dir, exec: () => {} });
    };
    run();
    for (const f of [
      'manifest.json', 'versions.json', 'esbuild.config.mjs', 'tsconfig.json',
      'src/main.ts', 'src/settings.ts', 'src/styles.css',
      'src/ui/VueView.ts', 'src/ui/vue/App.vue', 'src/ui/vue/router.ts', 'tests/vue/appRouting.test.ts',
      'vitest.config.mjs', 'tests/setup.ts', 'tests/__mocks__/obsidian.ts', 'tests/obsidian-augment.d.ts',
      'tests/unit/settings.test.ts', 'tests/vue/counterStore.test.ts',
      'eslint.config.mjs', '.prettierrc.json', '.editorconfig', '.npmrc',
      'scripts/sync-version.mjs', 'scripts/check-css-important.mjs', 'scripts/check-artifacts.mjs',
      'src/core/events/EventBus.ts', 'src/core/notices/NoticeService.ts', 'src/core/modals/ModalService.ts',
      'src/core/commands/CommandsService.ts', 'src/core/logging/Logger.ts', 'src/core/settings/SettingsService.ts',
      'src/core/vault/VaultService.ts', 'src/core/http/RequestService.ts',
      'src/commands.ts', 'src/ui/statusBar.ts', 'src/ui/registerViews.ts',
      'src/i18n/i18n.ts', 'src/i18n/en.json', 'tests/unit/i18n.test.ts', '.claude/settings.json',
      'tests/unit/eventBus.test.ts', 'tests/unit/modalService.test.ts', 'tests/unit/commandsService.test.ts',
      'tests/unit/statusBar.test.ts', 'tests/unit/logger.test.ts', 'tests/unit/settingsService.test.ts',
      'tests/unit/vaultService.test.ts', 'tests/unit/requestService.test.ts',
      'CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/adr/0001-plugin-architecture-baseline.md',
    ]) {
      assert.ok(existsSync(join(p.dir, f)), `missing ${f}`);
    }
    // GitHub off → neither the release workflow nor the /release command that
    // assumes it is generated.
    for (const f of ['.github/workflows/release.yml', '.claude/commands/release.md']) {
      assert.ok(!existsSync(join(p.dir, f)), `${f} should be gated off without github`);
    }
    const pkg = JSON.parse(readFileSync(join(p.dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.dev, 'node esbuild.config.mjs');
    assert.equal(pkg.scripts['check:css'], 'node scripts/check-css-important.mjs');

    const second = run();
    assert.deepEqual(second.changed, []);
  } finally {
    p.cleanup();
  }
});

test('brownfield apply: a complete existing manifest and entry are kept byte-for-byte', () => {
  // Complete = carries minAppVersion + isDesktopOnly, so neither reconcile fires;
  // the non-destructive guarantee is that we never rewrite a manifest that has no gap.
  const manifest = JSON.stringify({ id: 'mine', version: '3.2.1', minAppVersion: '1.4.0', isDesktopOnly: true });
  const p = tmpProject({ 'manifest.json': manifest, 'src/main.ts': '// mine\n' });
  try {
    const options = loadFrom(p.dir, { obsidian: OBSIDIAN });
    const state = detect(p.dir);
    freezeOptions(options, null, state);
    apply(plan(options, state), { cwd: p.dir, exec: () => {} });
    assert.equal(readFileSync(join(p.dir, 'manifest.json'), 'utf8'), manifest);
    assert.equal(readFileSync(join(p.dir, 'src/main.ts'), 'utf8'), '// mine\n');
  } finally {
    p.cleanup();
  }
});

test('verify runs the obsidian gate set: check:css, typecheck, build, check:artifacts', () => {
  const p = tmpProject({ 'package.json': { name: 'x' } });
  try {
    const options = loadFrom(p.dir, { obsidian: OBSIDIAN, guardrails: { coverageFloors: false } });
    freezeOptions(options, null, detect(p.dir));
    const scripts = [];
    runGates(p.dir, options, (cmd, args) => scripts.push(args.at(-1)));
    for (const s of ['check:css', 'typecheck', 'format:check', 'build', 'check:artifacts', 'test']) {
      assert.ok(scripts.includes(s), `verify missing gate ${s} (ran: ${scripts.join(', ')})`);
    }
  } finally {
    p.cleanup();
  }
});
