// scripts/tests/docs.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planDocs, planPrds } from '../lib/harness.mjs';

test('planDocs scaffolds the taxonomy and renders the guide from options', () => {
  const actions = planDocs({ docs: { scaffold: true }, testFramework: 'vitest', locCap: 500, guardrails: { locGuard: true, fallowRatchet: true } });
  const paths = actions.map((a) => a.path);
  assert.ok(paths.includes('CONTEXT.md'));
  assert.ok(paths.includes('docs/adr/0000-template.md'));
  assert.ok(paths.includes('docs/quality-integration-guide.md'));
  const guide = actions.find((a) => a.path === 'docs/quality-integration-guide.md');
  assert.match(guide.content, /\*\*vitest\*\*/);
  assert.match(guide.content, /cap 500/);
  for (const a of actions) assert.equal(a.mode, 'skip-if-exists'); // never clobber user docs
});

test('planDocs renders only the enabled gates in the guide', () => {
  const actions = planDocs({ docs: { scaffold: true }, testFramework: 'jest', guardrails: { eslintSeverityStaging: true, locGuard: false, fallowRatchet: false, coverageFloors: false } });
  const guide = actions.find((a) => a.path === 'docs/quality-integration-guide.md');
  assert.match(guide.content, /npm run lint/);
  assert.doesNotMatch(guide.content, /check:loc/);
  assert.doesNotMatch(guide.content, /check:quality/);
  assert.doesNotMatch(guide.content, /test:coverage/);
});

test('planDocs renders the detected package manager into the guide + CONTRIBUTING', () => {
  const actions = planDocs({ docs: { scaffold: true }, guardrails: { eslintSeverityStaging: true } }, { packageManager: 'pnpm' });
  const guide = actions.find((a) => a.path === 'docs/quality-integration-guide.md');
  const contributing = actions.find((a) => a.path === 'CONTRIBUTING.md');
  assert.match(guide.content, /pnpm lint/);
  assert.doesNotMatch(guide.content, /npm run lint/);
  assert.match(contributing.content, /pnpm lint/);
  assert.doesNotMatch(contributing.content, /npm run/);
});

test('CONTRIBUTING reflects only enabled gates and uses the coverage test gate', () => {
  const actions = planDocs(
    { docs: { scaffold: true }, guardrails: { eslintSeverityStaging: true, locGuard: false, fallowRatchet: false, coverageFloors: true } },
    {},
  );
  const c = actions.find((a) => a.path === 'CONTRIBUTING.md').content;
  assert.match(c, /npm run lint/);
  assert.doesNotMatch(c, /check:loc/); // disabled gate not advertised
  assert.doesNotMatch(c, /check:quality/);
  assert.match(c, /test:coverage/); // matches what CI/verify enforce
});

test('planDocs is a no-op when scaffold is off', () => {
  assert.deepEqual(planDocs({ docs: { scaffold: false } }), []);
});

test('planPrds renders each PRD + an index (skip-if-exists), and no-ops when empty', () => {
  assert.deepEqual(planPrds({ prds: [] }), []);
  assert.deepEqual(planPrds({}), []);

  const actions = planPrds({
    prds: [
      { id: 'prd-000', title: 'Product Vision', status: 'draft', created: '2026-07-18', problem: 'P', vision: 'V', goals: ['g1', 'g2'], notes: '' },
      { id: 'prd-001', title: 'Search & Filter', status: 'draft', created: '', problem: '', vision: '', goals: [], notes: '' },
    ],
  });

  assert.deepEqual(
    actions.map((a) => a.path),
    ['docs/prds/prd-000-product-vision.md', 'docs/prds/prd-001-search-filter.md', 'docs/prds/README.md'],
  );
  assert.ok(actions.every((a) => a.mode === 'skip-if-exists')); // never clobber user edits

  const vision = actions[0].content;
  assert.match(vision, /^---\nid: prd-000\ntitle: "Product Vision"\nstatus: draft\ntype: prd\ncreated: 2026-07-18\n---/);
  assert.match(vision, /## Goals\n\n- g1\n- g2/);
  // empty fields fall back to _TBD._ (never a blank section)
  assert.match(actions[1].content, /## Problem\n\n_TBD\._/);
  assert.match(actions[1].content, /## Goals\n\n_TBD\._/);
  // the README indexes every PRD with a working relative link
  assert.match(actions.at(-1).content, /\[prd-000\]\(prd-000-product-vision\.md\) \| Product Vision \| draft/);
  assert.match(actions.at(-1).content, /\[prd-001\]\(prd-001-search-filter\.md\)/);
});

test('planPrds notices when a PRD was added since the last apply (the index needs relinking)', () => {
  const prd = (id) => ({ id, title: 'X', status: 'draft', created: '', goals: [] });
  const two = { prds: [prd('prd-000'), prd('prd-001')] };
  // Prior had 1 PRD, now 2 → notice to relink the index.
  assert.ok(planPrds(two, { priorOptions: { prds: [prd('prd-000')] } }).some((a) => a.type === 'notice' && /index table/.test(a.message)));
  // Same PRD set on re-apply → no notice.
  assert.ok(!planPrds(two, { priorOptions: { prds: [prd('prd-000'), prd('prd-001')] } }).some((a) => a.type === 'notice'));
  // First apply (no prior) → no notice.
  assert.ok(!planPrds(two, {}).some((a) => a.type === 'notice'));
});

test('planPrds slug is path-safe — a crafted title cannot escape docs/prds/', () => {
  const actions = planPrds({ prds: [{ id: 'prd-000', title: '../../etc/passwd', status: 'draft', created: '', goals: [] }] });
  assert.equal(actions[0].path, 'docs/prds/prd-000-etc-passwd.md'); // dots/slashes collapsed to -
});
