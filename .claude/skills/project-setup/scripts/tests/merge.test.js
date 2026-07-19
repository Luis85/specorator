// .claude/skills/project-setup/scripts/tests/merge.test.js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { backupFile, deepMerge, mergeJsonFile, mergeTextLines } from '../lib/merge.mjs';
import { tmpProject } from './helpers.js';

test('mergeJsonFile force accepts a dotted scripts.X path (replaces a stale nested scalar)', () => {
  const { merged } = mergeJsonFile(
    'x',
    { scripts: { verify: 'new chain' } },
    { scripts: { verify: 'old chain', other: 'keep' } },
    ['scripts.verify'],
  );
  assert.equal(merged.scripts.verify, 'new chain', 'the recomputed script must win');
  assert.equal(merged.scripts.other, 'keep', 'unrelated scripts survive');
});

test('mergeJsonFile force splits on the first dot, so a glob sub-key with dots is forced and siblings survive', () => {
  const { merged } = mergeJsonFile(
    'x',
    { 'nano-staged': { '*.{ts,mts}': ['prettier'] } },
    { 'nano-staged': { '*.{ts,mts}': ['eslint', 'prettier'], '*.py': ['black'] } },
    ['nano-staged.*.{ts,mts}'],
  );
  assert.deepEqual(merged['nano-staged']['*.{ts,mts}'], ['prettier'], 'the engine glob value is forced');
  assert.deepEqual(merged['nano-staged']['*.py'], ['black'], "the user's unrelated pattern survives");
});

test('deepMerge keeps existing scalars, adds missing keys, unions arrays', () => {
  const base = { scripts: { lint: 'mine' }, keywords: ['a'] };
  const patch = { scripts: { lint: 'theirs', test: 'jest' }, keywords: ['a', 'b'] };
  assert.deepEqual(deepMerge(base, patch), {
    scripts: { lint: 'mine', test: 'jest' }, // existing 'lint' preserved
    keywords: ['a', 'b'],
  });
});

test('mergeJsonFile force makes the patch win over an existing scalar (version sync)', () => {
  const r = mergeJsonFile('x', { version: '3.2.1', name: 'keep' }, { version: '1.0.0', name: 'mine', extra: 1 }, ['version']);
  assert.equal(r.merged.version, '3.2.1'); // forced key -> patch wins
  assert.equal(r.merged.name, 'mine'); // unforced scalar -> base kept
  assert.equal(r.merged.extra, 1); // untouched
});

test('mergeJsonFile is idempotent', () => {
  const p = tmpProject({ 'package.json': { name: 'x', scripts: { build: 'tsc' } } });
  try {
    const path = join(p.dir, 'package.json');
    const first = mergeJsonFile(path, { scripts: { lint: 'eslint .' } });
    assert.equal(first.changed, true);
    // Apply the result, then merge the same patch again -> no change.
    const second = mergeJsonFile(path, { scripts: { build: 'tsc' } }, first.merged);
    assert.equal(second.changed, false);
  } finally {
    p.cleanup();
  }
});

test('mergeJsonFile overwrites the npm-init placeholder test script (day-one gate not dead on arrival)', () => {
  const placeholder = 'echo "Error: no test specified" && exit 1';
  const r = mergeJsonFile(
    'x',
    { scripts: { test: 'vitest run --passWithNoTests', build: 'esbuild' } },
    { name: 'fresh', scripts: { test: placeholder } },
  );
  assert.equal(r.merged.scripts.test, 'vitest run --passWithNoTests'); // placeholder overwritten
  assert.equal(r.merged.scripts.build, 'esbuild'); // added
  // A REAL user script (not the placeholder) is still kept, not clobbered.
  const kept = mergeJsonFile('x', { scripts: { test: 'vitest run' } }, { scripts: { test: 'my-runner' } });
  assert.equal(kept.merged.scripts.test, 'my-runner');
});

test('mergeTextLines appends only missing lines', () => {
  const existing = 'node_modules/\ncoverage/\n';
  const r1 = mergeTextLines(existing, ['coverage/', '.fallow/'], 'project-setup');
  assert.match(r1.text, /\.fallow\//);
  assert.equal((r1.text.match(/coverage\//g) ?? []).length, 1); // not duplicated
  const r2 = mergeTextLines(r1.text, ['.fallow/'], 'project-setup');
  assert.equal(r2.changed, false);
});

test('backupFile copies an existing file into the backup dir', () => {
  const p = tmpProject({ 'eslint.config.mjs': 'export default []' });
  try {
    const dest = backupFile(join(p.dir, 'eslint.config.mjs'), join(p.dir, '.bak'));
    assert.ok(existsSync(dest));
    assert.equal(readFileSync(dest, 'utf8'), 'export default []');
    assert.equal(backupFile(join(p.dir, 'missing.txt'), join(p.dir, '.bak')), null);
  } finally {
    p.cleanup();
  }
});

test('backupFile with cwd path-preserves so same-basename files in different dirs never collide', () => {
  const p = tmpProject({
    'a/config.json': '{"src":"a"}',
    'b/config.json': '{"src":"b"}',
  });
  try {
    const bak = join(p.dir, '.bak');
    const destA = backupFile(join(p.dir, 'a/config.json'), bak, p.dir);
    const destB = backupFile(join(p.dir, 'b/config.json'), bak, p.dir);
    assert.notEqual(destA, destB);
    assert.ok(existsSync(destA));
    assert.ok(existsSync(destB));
    assert.equal(readFileSync(destA, 'utf8'), '{"src":"a"}');
    assert.equal(readFileSync(destB, 'utf8'), '{"src":"b"}');
  } finally {
    p.cleanup();
  }
});
