// scripts/tests/options.test.js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { FALLOW_NODE_FLOOR, freezeOptions, hostNodeProblem, loadOptions, OBSIDIAN_NODE_ENGINES, OBSIDIAN_NODE_FLOOR, validateObsidianFields } from '../lib/options.mjs';

function withConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), 'opt-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, content);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('validateObsidianFields accepts a clean manifest and flags marketplace violations', () => {
  assert.deepEqual(
    validateObsidianFields({ id: 'quick-notes', name: 'Quick Notes', description: 'Capture quick notes fast.' }),
    [],
  );
  // Forbidden words in name / id / description (obsidianmd rejects "obsidian"/"plugin").
  assert.ok(validateObsidianFields({ id: 'a', name: 'Cool Obsidian Plugin', description: 'A fine description here.' }).some((p) => /name/i.test(p)));
  assert.ok(validateObsidianFields({ id: 'my-plugin', name: 'Cool', description: 'A fine description here.' }).some((p) => /id/i.test(p)));
  assert.ok(validateObsidianFields({ id: 'a', name: 'Cool', description: 'A plugin that helps.' }).some((p) => /redundant|Obsidian/i.test(p)));
  // Description format: too short / no capital / no period / special chars.
  const fmt = (d) => validateObsidianFields({ id: 'a', name: 'Cool', description: d });
  assert.ok(fmt('short').some((p) => /Description must be/.test(p)));
  assert.ok(fmt('no capital start.').some((p) => /Description must be/.test(p)));
  assert.ok(fmt('No trailing period').some((p) => /Description must be/.test(p)));
  assert.ok(fmt('Has an emoji 🎉 here.').some((p) => /Description must be/.test(p)));
  // Digit-leading id → invalid CSS class prefix (".24-...-view").
  assert.ok(
    validateObsidianFields({ id: '24-hour-notes', name: 'Cool', description: 'A fine description here.' }).some((p) =>
      /start with a letter/.test(p),
    ),
  );
  // Runtime API floors: every variant uses Vault.getFileByPath (v1.5.7); the Vue view
  // additionally awaits revealLeaf (v1.7.2). The manifest must not advertise below them.
  const base = { id: 'a', name: 'Cool', description: 'A fine description here.' };
  // Non-vue: floor 1.5.7 (getFileByPath), NOT the vue 1.7.2 floor.
  assert.ok(validateObsidianFields({ ...base, vue: false, minAppVersion: '1.4.0' }).some((p) => /1\.5\.7/.test(p)));
  assert.deepEqual(validateObsidianFields({ ...base, vue: false, minAppVersion: '1.5.7' }), []);
  assert.deepEqual(validateObsidianFields({ ...base, vue: false, minAppVersion: '1.6.0' }), []); // between the floors — fine without vue
  // Vue: stricter 1.7.2 floor (revealLeaf). 1.6.0 clears getFileByPath but not revealLeaf.
  assert.ok(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.6.0' }).some((p) => /1\.7\.2/.test(p)));
  assert.ok(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.4.0' }).some((p) => /1\.7\.2/.test(p)));
  assert.deepEqual(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.7.2' }), []);
  assert.deepEqual(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.10.0' }), []);
});

test('freezeOptions makes the obsidian vue/mobile variant immutable across re-apply', () => {
  const options = { obsidian: { vue: false, mobile: true } };
  freezeOptions(options, { obsidian: { vue: true, mobile: false }, packageManager: 'npm' }, {});
  assert.equal(options.obsidian.vue, true, 'vue is frozen to the first apply');
  assert.equal(options.obsidian.mobile, false, 'mobile is frozen to the first apply');
  // A first apply (no prior report) keeps the given choice.
  const fresh = { obsidian: { vue: false, mobile: true } };
  freezeOptions(fresh, null, {});
  assert.equal(fresh.obsidian.vue, false);
  assert.equal(fresh.obsidian.mobile, true);
});

test('loadOptions throws a clear error on malformed JSON', () => {
  const c = withConfig('{ not json');
  try {
    assert.throws(() => loadOptions(c.path), /Could not read answers JSON/);
  } finally {
    c.cleanup();
  }
});

test('loadOptions rejects a non-object answers file', () => {
  const c = withConfig('"hello"');
  try {
    assert.throws(() => loadOptions(c.path), /must be a JSON object/);
  } finally {
    c.cleanup();
  }
});

test('loadOptions sanitizes a non-integer locCap to the default (no code injection into check-loc.mjs)', () => {
  const c = withConfig(JSON.stringify({ locCap: '500;\nglobalThis.x=1' }));
  try {
    assert.equal(loadOptions(c.path).locCap, 500);
  } finally {
    c.cleanup();
  }
});

test('loadOptions keeps a valid integer locCap', () => {
  const c = withConfig(JSON.stringify({ locCap: 300 }));
  try {
    assert.equal(loadOptions(c.path).locCap, 300);
  } finally {
    c.cleanup();
  }
});

test('loadOptions defaults prds to an empty array', () => {
  const c = withConfig('{}');
  try {
    assert.deepEqual(loadOptions(c.path).prds, []);
  } finally {
    c.cleanup();
  }
});

test('loadOptions sanitizes prds: auto-numbers ids, defaults title/status, coerces goals', () => {
  const c = withConfig(
    JSON.stringify({
      prds: [
        { title: 'Vision', problem: 'P' }, // no id -> prd-000; title kept
        { id: 'prd-007', title: '', goals: ['a', '', '  b  '] }, // empty title -> Untitled; goals trimmed/filtered
        'not-an-object', // -> defaults at index 2
      ],
    }),
  );
  try {
    const { prds } = loadOptions(c.path);
    assert.equal(prds[0].id, 'prd-000');
    assert.equal(prds[0].title, 'Vision');
    assert.equal(prds[0].status, 'draft');
    assert.equal(prds[1].id, 'prd-007'); // valid id kept
    assert.equal(prds[1].title, 'Untitled');
    assert.deepEqual(prds[1].goals, ['a', 'b']); // empties dropped, trimmed
    assert.equal(prds[2].id, 'prd-002'); // non-object -> defaults, auto-numbered
    assert.equal(prds[2].title, 'Untitled');
  } finally {
    c.cleanup();
  }
});

test('hostNodeProblem: eslint/jsdom force ^22.13 || >=24 (23.x hole); a fallow-only apply just needs >=22', () => {
  assert.deepEqual(FALLOW_NODE_FLOOR, [22, 0, 0]);
  assert.deepEqual(OBSIDIAN_NODE_FLOOR, [22, 13, 0]);
  assert.equal(OBSIDIAN_NODE_ENGINES, '^22.13.0 || >=24.0.0');
  const obs = { obsidian: { id: 'a', name: 'A' } };
  const genericLint = { guardrails: { eslintSeverityStaging: true } }; // generic default: eslint 10 installed
  const noLint = { guardrails: { eslintSeverityStaging: false } }; // lint off: only fallow constrains the host
  // Both obsidian (jsdom) and the eslint-on generic default reject below the floor AND
  // the whole 23.x line, stating the real range + the host version.
  for (const opts of [obs, genericLint]) {
    for (const v of ['20.11.1', '22.0.0', '22.12.99', '23.0.0', '23.11.5']) {
      const p = hostNodeProblem(opts, v);
      assert.ok(p, `expected a problem for Node ${v}`);
      assert.match(p, /\^22\.13\.0 \|\| >=24\.0\.0/);
      assert.match(p, new RegExp(v.replace(/\./g, '\\.')));
    }
    for (const v of ['22.13.0', '22.20.0', '24.0.0', '25.1.0']) assert.equal(hostNodeProblem(opts, v), null, `${JSON.stringify(opts)} ${v}`);
  }
  // Lint off (no eslint, no jsdom): only fallow's >=22 — no 22.13 floor, no 23.x hole.
  for (const v of ['18.19.0', '20.11.1', '21.7.0']) {
    const p = hostNodeProblem(noLint, v);
    assert.ok(p, `no-lint expected a problem for Node ${v}`);
    assert.match(p, />=22\.0\.0/);
  }
  for (const v of ['22.0.0', '22.12.0', '23.5.0', '24.0.0']) assert.equal(hostNodeProblem(noLint, v), null, `no-lint ${v}`);
  // The divergence: Node 23.5 clears a fallow-only apply but not an eslint/jsdom one.
  assert.equal(hostNodeProblem(noLint, '23.5.0'), null);
  assert.ok(hostNodeProblem(genericLint, '23.5.0'), 'eslint-on generic still blocks 23.x');
  assert.ok(hostNodeProblem(obs, '22.12.0'), 'obsidian still blocks 22.12 (needs 22.13)');
});

test('freezeOptions freezes obsidian identity (id + name) to the first apply', () => {
  const options = { obsidian: { id: 'fast-notes', name: 'Fast Notes', vue: false, mobile: false } };
  // A rename attempt on re-apply is ignored — identity is pinned to the prior report.
  freezeOptions(options, { obsidian: { id: 'quick-notes', name: 'Quick Notes', vue: false, mobile: false }, packageManager: 'npm' }, {});
  assert.equal(options.obsidian.id, 'quick-notes', 'id frozen to first apply');
  assert.equal(options.obsidian.name, 'Quick Notes', 'name frozen to first apply');
  // First apply (no prior report) keeps the requested identity.
  const fresh = { obsidian: { id: 'fast-notes', name: 'Fast Notes' } };
  freezeOptions(fresh, null, {});
  assert.equal(fresh.obsidian.id, 'fast-notes');
  assert.equal(fresh.obsidian.name, 'Fast Notes');
});
