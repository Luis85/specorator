// scripts/tests/harness-ci.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planCi, planInstall } from '../lib/harness.mjs';

test('planCi only emits the workflow when GitHub integration is opted in', () => {
  // CI on + GitHub off: a notice, NOT a silent skip (the workflow can't be written).
  const offGithub = planCi({ github: { integrate: false }, guardrails: { ci: true } }, { packageManager: 'npm' });
  assert.equal(offGithub.find((a) => a.path === '.github/workflows/ci.yml'), undefined);
  assert.ok(offGithub.some((a) => a.type === 'notice' && /GitHub integration is off/.test(a.message)));
  // CI not requested at all: silent — nothing to surface.
  assert.deepEqual(planCi({ github: { integrate: false }, guardrails: { ci: false } }, { packageManager: 'npm' }), []);
  const actions = planCi(
    { github: { integrate: true }, guardrails: { ci: true, eslintSeverityStaging: true, locGuard: true, fallowRatchet: true, coverageFloors: true } },
    { packageManager: 'npm' },
  );
  const wf = actions.find((a) => a.path === '.github/workflows/ci.yml');
  // No existing unmarked workflow -> overwrite-backup so a marked generic CI is
  // upgraded (a re-apply of our own content no-ops in apply()).
  assert.equal(wf.mode, 'overwrite-backup');
  assert.match(wf.content, /npm ci/);
  assert.match(wf.content, /npm run lint/);
  assert.match(wf.content, /npm run check:loc/);
  assert.match(wf.content, /npm run check:quality/);
  assert.match(wf.content, /npm run test:coverage/);
  // The default branch renders as a QUOTED YAML scalar so it stays a single filter.
  assert.match(wf.content, /branches: \["main"\]/);
});

test('planCi quotes the detected default branch so YAML flow chars stay one filter', () => {
  // A git-legal branch name can carry YAML flow syntax: `release,prod` bare would
  // split into two filters, `foo]bar` would close the sequence early and break the
  // file. JSON-stringifying it yields one correctly-escaped YAML scalar.
  const branchy = planCi(
    { github: { integrate: true }, guardrails: { ci: true } },
    { packageManager: 'npm', defaultBranch: 'release,prod' },
  ).find((a) => a.path === '.github/workflows/ci.yml');
  assert.match(branchy.content, /branches: \["release,prod"\]/); // one quoted filter, not two
});

test('planCi warns when a previously generated ci.yml is left stale by a CI/GitHub opt-out', () => {
  const priorOn = { priorOptions: { guardrails: { ci: true }, github: { integrate: true } }, packageManager: 'npm' };
  // CI turned off on re-apply → ci.yml not rewritten, but the old one keeps running: warn.
  assert.ok(planCi({ github: { integrate: true }, guardrails: { ci: false } }, priorOn).some((a) => a.type === 'notice' && /ci\.yml remains/.test(a.message)));
  // GitHub turned off → same stale ci.yml, same warning (alongside the github-off notice).
  assert.ok(planCi({ github: { integrate: false }, guardrails: { ci: true } }, priorOn).some((a) => a.type === 'notice' && /ci\.yml remains/.test(a.message)));
  // No prior apply (first run) → no stale warning.
  assert.ok(!planCi({ github: { integrate: false }, guardrails: { ci: false } }, { packageManager: 'npm' }).some((a) => /ci\.yml remains/.test(a.message)));
  // Still writing ci.yml (both on) → no stale warning; it's refreshed, not stale.
  assert.ok(!planCi({ github: { integrate: true }, guardrails: { ci: true } }, priorOn).some((a) => a.type === 'notice' && /ci\.yml remains/.test(a.message)));
});

test('planCi gates each step on its guardrail flag (no step for a disabled guardrail)', () => {
  const actions = planCi(
    { github: { integrate: true }, guardrails: { ci: true, eslintSeverityStaging: true, locGuard: false, fallowRatchet: false, coverageFloors: false } },
    { packageManager: 'npm' },
  );
  const wf = actions.find((a) => a.path === '.github/workflows/ci.yml');
  assert.match(wf.content, /npm run lint/);
  assert.doesNotMatch(wf.content, /check:loc/); // guardrail off -> script absent -> no step
  assert.doesNotMatch(wf.content, /check:quality/);
  assert.match(wf.content, /npm run test\b/); // base test step always present
  assert.doesNotMatch(wf.content, /test:coverage/);
});

test('planCi renders the detected package manager (pnpm)', () => {
  const actions = planCi(
    { github: { integrate: true }, guardrails: { ci: true, fallowRatchet: true } },
    { packageManager: 'pnpm' },
  );
  const wf = actions.find((a) => a.path === '.github/workflows/ci.yml');
  assert.match(wf.content, /pnpm\/action-setup/);
  assert.match(wf.content, /pnpm install --frozen-lockfile/);
  assert.match(wf.content, /cache: pnpm/);
  assert.match(wf.content, /pnpm check:quality/);
  assert.match(wf.content, /version: 9/);
});

test('planCi emits a notice for bun instead of a broken npm-style workflow', () => {
  const actions = planCi({ github: { integrate: true }, guardrails: { ci: true } }, { packageManager: 'bun' });
  assert.equal(actions.find((a) => a.path === '.github/workflows/ci.yml'), undefined);
  assert.ok(actions.some((a) => a.type === 'notice' && /bun/.test(a.message)));
});

test('planCi emits a notice when an existing ci.yml would be left untouched', () => {
  const actions = planCi(
    { github: { integrate: true }, guardrails: { ci: true, fallowRatchet: true } },
    { packageManager: 'npm', ciWorkflow: true },
  );
  const wf = actions.find((a) => a.path === '.github/workflows/ci.yml');
  assert.equal(wf.mode, 'skip-if-exists'); // an UNMARKED user workflow is never clobbered
  assert.ok(actions.some((a) => a.type === 'notice' && /ci\.yml kept/.test(a.message)));
});

test('planCi targets the detected default branch, not a hardcoded main', () => {
  const wf = planCi(
    { github: { integrate: true }, guardrails: { ci: true, fallowRatchet: true } },
    { packageManager: 'npm', defaultBranch: 'develop' },
  ).find((a) => a.path === '.github/workflows/ci.yml');
  assert.match(wf.content, /branches: \["develop"\]/); // push targets the detected trunk (quoted)
  assert.doesNotMatch(wf.content, /\["main"\]/);
  // pull_request is unfiltered so PRs to the real trunk run even if detection is off.
  assert.doesNotMatch(wf.content, /pull_request:\s*\n\s*branches:/);
});

test('planCi reminds the user to commit the lockfile as an INFO next step (not a collision)', () => {
  const actions = planCi(
    { github: { integrate: true }, guardrails: { ci: true, fallowRatchet: true } },
    { packageManager: 'pnpm' },
  );
  const n = actions.find((a) => a.type === 'notice' && /lockfile/.test(a.message));
  assert.ok(n);
  assert.equal(n.level, 'info');
});

test('planInstall emits one installDeps action for the detected package manager', () => {
  assert.deepEqual(planInstall({}, { packageManager: 'pnpm' }), [{ type: 'installDeps', packageManager: 'pnpm' }]);
});

test('planInstall sanitizes an unknown/crafted package manager to npm (never exec it)', () => {
  assert.deepEqual(planInstall({ packageManager: '/tmp/evil.sh' }, {}), [{ type: 'installDeps', packageManager: 'npm' }]);
});

test('planInstall: resolved option wins over state (options.packageManager takes precedence)', () => {
  assert.deepEqual(
    planInstall({ packageManager: 'pnpm' }, { packageManager: 'npm' }),
    [{ type: 'installDeps', packageManager: 'pnpm' }],
  );
});

test('planCi: resolved option wins over state (options.packageManager takes precedence)', () => {
  const actions = planCi(
    { packageManager: 'pnpm', github: { integrate: true }, guardrails: { ci: true } },
    { packageManager: 'npm' },
  );
  const wf = actions.find((a) => a.path === '.github/workflows/ci.yml');
  assert.match(wf.content, /pnpm install --frozen-lockfile/);
});
