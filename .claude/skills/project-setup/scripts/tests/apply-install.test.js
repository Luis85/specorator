// scripts/tests/apply-install.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { apply } from '../lib/apply.mjs';
import { tmpProject } from './helpers.js';

test('installDeps runs the package manager when package.json changed, and is not a tracked change', () => {
  const p = tmpProject({ 'package.json': { name: 'x' } });
  const calls = [];
  const exec = (cmd, args, opts) => calls.push({ cmd, args, cwd: opts.cwd });
  try {
    const res = apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'pnpm' },
    ], { cwd: p.dir, exec });
    assert.deepEqual(calls, [{ cmd: 'pnpm', args: ['install'], cwd: p.dir }]);
    assert.ok(res.planned.includes('(install)')); // install is previewed in the plan
    assert.ok(!res.changed.includes('(install)')); // install is an effect, not a tracked change
  } finally {
    p.cleanup();
  }
});

test('installDeps is skipped when package.json did not change, the marker records the same manager, and node_modules is present', () => {
  const p = tmpProject({
    'package.json': { name: 'x', devDependencies: { left: '1.0.0' } },
    '.project-setup-backup/.installed': 'npm', // marker records the manager it installed with
    'node_modules/.keep': '', // deps still present
  });
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'npm' },
    ], { cwd: p.dir, exec: (...a) => calls.push(a) });
    assert.equal(calls.length, 0); // converged + marker matches + deps present -> no install
  } finally {
    p.cleanup();
  }
});

test('installDeps records the selected manager in the marker after installing', () => {
  const p = tmpProject({ 'package.json': { name: 'x' } });
  try {
    apply([{ type: 'installDeps', packageManager: 'pnpm' }], { cwd: p.dir, exec: () => {} });
    assert.equal(readFileSync(join(p.dir, '.project-setup-backup', '.installed'), 'utf8'), 'pnpm');
  } finally {
    p.cleanup();
  }
});

test('installDeps REINSTALLS when node_modules was removed even though the marker is present', () => {
  // A marker records a completed install, but the user deleted node_modules — the
  // deps are gone, so a re-apply must reinstall rather than falsely converge.
  const p = tmpProject({
    'package.json': { name: 'x', devDependencies: { left: '1.0.0' } },
    '.project-setup-backup/.installed': 'npm',
  }); // no node_modules dir
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'npm' },
    ], { cwd: p.dir, exec: (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`) });
    assert.deepEqual(calls, ['npm install']);
  } finally {
    p.cleanup();
  }
});

test('installDeps treats a Yarn PnP layout (.pnp.cjs, no node_modules) as converged', () => {
  // Yarn PnP installs create the .pnp.cjs loader instead of node_modules, so a
  // node_modules-only "deps present" check would reinstall on every converged
  // re-apply (and fail offline). The .pnp.cjs artifact counts as installed.
  const p = tmpProject({
    'package.json': { name: 'x', devDependencies: { left: '1.0.0' } },
    '.project-setup-backup/.installed': 'yarn',
    '.pnp.cjs': '/* pnp loader */', // Yarn PnP artifact; no node_modules dir
  });
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'yarn' },
    ], { cwd: p.dir, exec: (...a) => calls.push(a) });
    assert.equal(calls.length, 0); // marker matches + PnP artifact present -> no reinstall
  } finally {
    p.cleanup();
  }
});

test('installDeps ignores a stale .pnp.cjs for a non-yarn manager (reinstalls when node_modules is gone)', () => {
  // A project switched off Yarn PnP can leave .pnp.cjs behind; for npm/pnpm/bun the
  // node_modules IS the real artifact, so a leftover loader must not read as installed
  // and skip a needed reinstall.
  const p = tmpProject({
    'package.json': { name: 'x', devDependencies: { left: '1.0.0' } },
    '.project-setup-backup/.installed': 'npm',
    '.pnp.cjs': '/* stale pnp loader */', // leftover; no node_modules
  });
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'npm' },
    ], { cwd: p.dir, exec: (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`) });
    assert.deepEqual(calls, ['npm install']); // stale .pnp.cjs ignored for npm -> reinstall
  } finally {
    p.cleanup();
  }
});

test('installDeps REINSTALLS when the selected package manager changed', () => {
  // The marker records `npm`, but the plan now selects `pnpm` (e.g. answers.json
  // changed) — pnpm needs its own lockfile, so the stale npm marker must not skip.
  const p = tmpProject({
    'package.json': { name: 'x', devDependencies: { left: '1.0.0' } },
    '.project-setup-backup/.installed': 'npm',
    'node_modules/.keep': '',
  });
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'pnpm' },
    ], { cwd: p.dir, exec: (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`) });
    assert.deepEqual(calls, ['pnpm install']);
  } finally {
    p.cleanup();
  }
});

test('installDeps RETRIES when package.json is unchanged but the prior install never completed', () => {
  const p = tmpProject({ 'package.json': { name: 'x', devDependencies: { left: '1.0.0' } } }); // no .installed marker
  const calls = [];
  try {
    apply([
      { type: 'mergeJson', path: 'package.json', patch: { devDependencies: { left: '1.0.0' } } },
      { type: 'installDeps', packageManager: 'npm' },
    ], { cwd: p.dir, exec: (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`) });
    assert.deepEqual(calls, ['npm install']); // retried because install hadn't completed
  } finally {
    p.cleanup();
  }
});

test('installDeps is skipped in dry-run but still appears in planned', () => {
  const p = tmpProject({ 'package.json': { name: 'x' } });
  const calls = [];
  try {
    const res = apply([{ type: 'installDeps', packageManager: 'npm' }], { cwd: p.dir, dryRun: true, exec: (...a) => calls.push(a) });
    assert.equal(calls.length, 0);
    assert.ok(res.planned.includes('(install)'));
  } finally {
    p.cleanup();
  }
});
