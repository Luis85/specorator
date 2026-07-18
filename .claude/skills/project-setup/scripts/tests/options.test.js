// scripts/tests/options.test.js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadOptions } from '../lib/options.mjs';

function withConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), 'opt-'));
  const path = join(dir, 'answers.json');
  writeFileSync(path, content);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

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
