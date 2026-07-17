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
    const answers = { obsidian: OBSIDIAN, github: { integrate: false }, docs: { scaffold: true } };
    const run = () => {
      const options = loadFrom(p.dir, answers);
      const state = detect(p.dir);
      freezeOptions(options, null, state);
      return apply(plan(options, state), { cwd: p.dir, exec: () => {} });
    };
    run();
    for (const f of [
      'manifest.json', 'versions.json', 'esbuild.config.mjs', 'tsconfig.json',
      'src/main.ts', 'src/settings.ts', 'src/styles.css',
      'src/ui/VueView.ts', 'src/ui/vue/App.vue', 'src/ui/vue/router.ts',
      'vitest.config.mjs', 'tests/setup.ts', 'tests/__mocks__/obsidian.ts',
      'tests/unit/settings.test.ts', 'tests/vue/counterStore.test.ts',
      'eslint.config.mjs', '.prettierrc.json', '.editorconfig',
      'scripts/sync-version.mjs', 'scripts/check-css-important.mjs', 'scripts/check-artifacts.mjs',
      'CLAUDE.md', 'README.md',
    ]) {
      assert.ok(existsSync(join(p.dir, f)), `missing ${f}`);
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

test('brownfield apply: an existing manifest and entry are kept byte-for-byte', () => {
  const manifest = JSON.stringify({ id: 'mine', version: '3.2.1', minAppVersion: '1.4.0' });
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
    for (const s of ['check:css', 'typecheck', 'build', 'check:artifacts', 'test']) {
      assert.ok(scripts.includes(s), `verify missing gate ${s} (ran: ${scripts.join(', ')})`);
    }
  } finally {
    p.cleanup();
  }
});
