// scripts/tests/e2eScaffold.test.js
//
// Real-install greenfield smoke: scaffolds a fresh Obsidian plugin into a temp
// dir, runs a REAL install (via `setup.mjs apply`), and requires the full verify
// gate to pass. This is the guard that the greenfield guarantee — a fresh
// scaffold builds/lints/tests/bundles on day one — can't silently regress after a
// template or pin change.
//
// Two layers:
//   1. npm full-depth (both variants): apply → verify → re-apply idempotency +
//      the version-bump path.
//   2. pnpm/yarn/bun cross-PM (desktop + vue, the richest path): apply → verify,
//      proving strict-peer installs (pnpm), Yarn Classic, and bun all reach a
//      green gate on the same templates/pins, plus the CI-generation contract.
//
// SKIPPED BY DEFAULT: it needs network + a few minutes, so it never runs in the
// normal `node --test` suite. Run it manually after touching templates/pins:
//
//   PROJECT_SETUP_E2E=1 node --test scripts/tests/e2eScaffold.test.js
//
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SETUP = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'setup.mjs');
const skip = process.env.PROJECT_SETUP_E2E ? false : 'set PROJECT_SETUP_E2E=1 to run (real install, ~minutes)';

// Run setup.mjs <cmd> in dir; return captured stdout. Surface the captured
// output on a non-zero exit so a gate failure is diagnosable instead of a bare
// "Command failed".
function runSetup(dir, cmd) {
  try {
    return execFileSync('node', [SETUP, cmd, '--config', 'answers.json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    throw new Error(`setup ${cmd} failed (exit ${e.status}):\n${`${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim()}`);
  }
}

// Skip a cross-PM test gracefully when that manager isn't installed on the box
// running the manual E2E, instead of failing with a confusing exec error.
function pmAvailable(pm) {
  try {
    execFileSync(pm, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function writeAnswers(dir, { mobile, vue, packageManager }) {
  writeFileSync(
    join(dir, 'answers.json'),
    JSON.stringify({
      ...(packageManager ? { packageManager } : {}),
      obsidian: { id: 'demo-notes', name: 'Demo Notes', description: 'Track demo notes.', author: 'Tester', mobile, vue },
      github: { integrate: true },
      guardrails: { eslintSeverityStaging: true, locGuard: true, fallowRatchet: true, coverageFloors: true, ci: true, cssGuard: true },
      docs: { scaffold: true },
    }),
  );
}

// The two combinations the reference § Verification pins: exercise both the Vue
// island path and the mobile import bans / desktop externals in one pass each.
const VARIANTS = [
  { label: 'desktop + vue', mobile: false, vue: true },
  { label: 'mobile + no-vue', mobile: true, vue: false },
];

for (const v of VARIANTS) {
  test(`greenfield scaffold installs, builds, and verifies (${v.label})`, { skip, timeout: 600_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps-e2e-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      writeAnswers(dir, { mobile: v.mobile, vue: v.vue });
      runSetup(dir, 'apply'); // real npm install + writes + ratchet baselines
      runSetup(dir, 'verify'); // full gate chain (lint → quality → typecheck → format → coverage → build → artifacts); throws on failure
      assert.ok(existsSync(join(dir, 'main.js')), 'build emitted main.js');

      // Re-apply idempotency + the two re-apply bugs this pass fixed.
      const readJson = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const floored = () => /statements: [1-9]/.test(readFileSync(join(dir, 'vitest.config.mjs'), 'utf8'));
      assert.ok(floored(), 'the coverage baseline set a non-zero floor');
      // Simulate `npm version 0.2.0` (what sync-version writes across the trio).
      for (const f of ['manifest.json', 'package.json']) {
        const j = readJson(f);
        j.version = '0.2.0';
        writeFileSync(join(dir, f), JSON.stringify(j, null, 2) + '\n');
      }
      const versions = readJson('versions.json');
      versions['0.2.0'] = readJson('manifest.json').minAppVersion;
      writeFileSync(join(dir, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
      runSetup(dir, 'apply'); // re-apply after the bump
      // F1: the baselined coverage floor is NOT reset to 0 (overwrite would defeat the gate).
      assert.ok(floored(), 'coverage floor survived re-apply');
      // F2: package.json version stays synced to the bumped manifest, not reset to 0.1.0.
      assert.equal(readJson('package.json').version, '0.2.0', 'version stayed synced to the manifest on re-apply');
      runSetup(dir, 'verify'); // still green — check:artifacts proves the version trio agrees
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// Cross-PM install/build/verify on the richest variant (desktop + vue: Vue lane,
// the vite peer, and the CM6 editor externals). The npm pass above owns the deep
// re-apply/version checks; these prove the same templates + pins reach a green
// gate under each alternative manager, and that the PM actually ran the install
// (its lockfile is present).
const CROSS_PM = [
  { pm: 'pnpm', lockfile: (dir) => existsSync(join(dir, 'pnpm-lock.yaml')) },
  { pm: 'yarn', lockfile: (dir) => existsSync(join(dir, 'yarn.lock')) },
  // bun ≥1.2 writes text `bun.lock`; older bun wrote binary `bun.lockb`.
  { pm: 'bun', lockfile: (dir) => existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb')) },
];

for (const { pm, lockfile } of CROSS_PM) {
  const pmSkip = skip || (pmAvailable(pm) ? false : `${pm} is not installed on this machine`);
  test(`greenfield scaffold installs, builds, and verifies under ${pm} (desktop + vue)`, { skip: pmSkip, timeout: 600_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), `ps-e2e-${pm}-`));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      writeAnswers(dir, { mobile: false, vue: true, packageManager: pm });
      const applyOut = runSetup(dir, 'apply'); // real <pm> install + writes + baselines
      runSetup(dir, 'verify'); // full gate chain under <pm> run scripts; throws on failure
      assert.ok(existsSync(join(dir, 'main.js')), `${pm}: build emitted main.js`);
      assert.ok(lockfile(dir), `${pm}: the install wrote its lockfile (proves ${pm} actually ran)`);

      // CI-generation contract: npm/pnpm/yarn get a working ci.yml; bun has no
      // built-in workflow profile (an unverified bun CI would regress the harness's
      // "never ship a broken workflow" stance), so it emits a notice and writes
      // none. Assert both halves so the gap stays intentional, not a silent drop.
      const ci = join(dir, '.github', 'workflows', 'ci.yml');
      if (pm === 'bun') {
        assert.ok(!existsSync(ci), 'bun: no ci.yml is generated (no built-in profile)');
        assert.match(applyOut, /no built-in workflow profile for "bun"/, 'bun: apply surfaces the manual-CI notice');
      } else {
        assert.ok(existsSync(ci), `${pm}: wrote .github/workflows/ci.yml`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
