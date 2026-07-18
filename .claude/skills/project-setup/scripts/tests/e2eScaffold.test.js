// scripts/tests/e2eScaffold.test.js
//
// Real-install greenfield smoke: scaffolds a fresh Obsidian plugin into a temp
// dir, runs a REAL `npm install` (via `setup.mjs apply`), and requires the full
// verify gate to pass. This is the guard that the greenfield guarantee — a fresh
// scaffold builds/lints/tests/bundles on day one — can't silently regress after a
// template or pin change.
//
// SKIPPED BY DEFAULT: it needs network + a few minutes, so it never runs in the
// normal `node --test` suite. Run it manually after touching templates/pins:
//
//   PROJECT_SETUP_E2E=1 node --test scripts/tests/e2eScaffold.test.js
//
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SETUP = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'setup.mjs');
const skip = process.env.PROJECT_SETUP_E2E ? false : 'set PROJECT_SETUP_E2E=1 to run (real npm install, ~minutes)';

// The two combinations the reference § Verification pins: exercise both the Vue
// island path and the mobile import bans / desktop externals in one pass each.
const VARIANTS = [
  { label: 'desktop + vue', mobile: false, vue: true },
  { label: 'mobile + no-vue', mobile: true, vue: false },
];

for (const v of VARIANTS) {
  test(`greenfield scaffold installs, builds, and verifies (${v.label})`, { skip, timeout: 600_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps-e2e-'));
    // Run setup.mjs, surfacing the captured output on a non-zero exit so a gate
    // failure is diagnosable instead of a bare "Command failed".
    const run = (cmd) => {
      try {
        execFileSync('node', [SETUP, cmd, '--config', 'answers.json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        throw new Error(`setup ${cmd} failed (exit ${e.status}):\n${`${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim()}`);
      }
    };
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      writeFileSync(
        join(dir, 'answers.json'),
        JSON.stringify({
          obsidian: { id: 'demo-notes', name: 'Demo Notes', description: 'Track demo notes.', author: 'Tester', mobile: v.mobile, vue: v.vue },
          github: { integrate: true },
          guardrails: { eslintSeverityStaging: true, locGuard: true, fallowRatchet: true, coverageFloors: true, ci: true, cssGuard: true },
          docs: { scaffold: true },
        }),
      );
      run('apply'); // real npm install + writes + ratchet baselines
      run('verify'); // full gate chain (lint → quality → typecheck → format → coverage → build → artifacts); throws on failure
      assert.ok(existsSync(join(dir, 'main.js')), 'build emitted main.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
