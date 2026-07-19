// scripts/tests/pins.test.js — the pins store behind `refresh-pins`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PINNED } from '../lib/harness.mjs';

const PINS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'pins.json');

test('pins.json is a flat map of exact semver pins (determinism guarantee)', () => {
  const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8'));
  assert.ok(Object.keys(pins).length > 0);
  for (const [name, version] of Object.entries(pins)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is not an exact pin: ${version}`);
  }
});

test('PINNED is served from pins.json so refresh-pins takes effect without code edits', () => {
  const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8'));
  assert.deepEqual(PINNED, pins);
});
