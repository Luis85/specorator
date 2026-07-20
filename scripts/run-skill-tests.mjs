#!/usr/bin/env node
/**
 * Runs the bundled `project-setup` skill's node:test suite with an EXPLICIT file
 * list rather than `node --test "<glob>"`.
 *
 * Why: Node's `--test` CLI only learned to expand glob patterns in v22.19.0. The
 * package's `engines.node` floor is `>=22.13.0`, so on 22.13–22.18 a quoted glob
 * is treated as one literal path and the command fails with "Could not find …".
 * Enumerating the files ourselves keeps the gate working across the whole
 * supported range (and on Windows, where the shell won't expand the glob either).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = join(ROOT, '.claude', 'skills', 'project-setup', 'scripts', 'tests');

const files = readdirSync(TESTS_DIR, { recursive: true })
  .filter((name) => typeof name === 'string' && name.endsWith('.test.js'))
  .map((name) => join(TESTS_DIR, name))
  .sort();

if (files.length === 0) {
  console.error(`No skill test files found under ${TESTS_DIR}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
