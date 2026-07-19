// scripts/tests/options.test.js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { freezeOptions, loadOptions, obsidianNodeProblem, OBSIDIAN_NODE_FLOOR, validateObsidianFields } from '../lib/options.mjs';

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
  // Vue variant below the revealLeaf API floor (1.7.2) is rejected; at/above, or
  // non-vue, is fine.
  const base = { id: 'a', name: 'Cool', description: 'A fine description here.' };
  assert.ok(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.6.0' }).some((p) => /1\.7\.2/.test(p)));
  assert.deepEqual(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.7.2' }), []);
  assert.deepEqual(validateObsidianFields({ ...base, vue: true, minAppVersion: '1.10.0' }), []);
  assert.deepEqual(validateObsidianFields({ ...base, vue: false, minAppVersion: '1.6.0' }), []);
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

test('obsidianNodeProblem flags a host Node below the scaffold floor, passes at/above it', () => {
  const floor = OBSIDIAN_NODE_FLOOR.join('.'); // '22.13.0'
  // Below the floor: too-old majors and the 22.0–22.12 gap jsdom rejects.
  for (const v of ['18.19.0', '20.11.1', '22.0.0', '22.12.0', '22.12.99']) {
    const p = obsidianNodeProblem(v);
    assert.ok(p, `expected a problem for Node ${v}`);
    assert.match(p, new RegExp(`>=${floor.replace(/\./g, '\\.')}`)); // documents the exact floor
    assert.match(p, new RegExp(v.replace(/\./g, '\\.'))); // names the offending version
  }
  // At or above the floor: clean, including the next major.
  for (const v of ['22.13.0', '22.13.5', '22.20.0', '23.4.0', '24.2.0']) {
    assert.equal(obsidianNodeProblem(v), null, `Node ${v} should pass`);
  }
});
