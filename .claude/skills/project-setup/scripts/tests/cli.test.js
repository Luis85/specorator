// .claude/skills/project-setup/scripts/tests/cli.test.js
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { cli, parseArgs } from '../setup.mjs';

function capture() {
  const chunks = { out: '', err: '' };
  return {
    io: { stdout: (s) => (chunks.out += s), stderr: (s) => (chunks.err += s), cwd: process.cwd() },
    chunks,
  };
}

// A temp project + an io that captures output, stubs the install (no real npm), and
// pins the host Node version so the Obsidian floor gate is deterministic.
function project(answers, nodeVersion) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-'));
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
  const chunks = { out: '', err: '' };
  return {
    dir,
    chunks,
    io: {
      stdout: (s) => (chunks.out += s),
      stderr: (s) => (chunks.err += s),
      cwd: dir,
      nodeVersion,
      exec: () => '', // never shell out to a package manager in unit tests
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const OBS_ANSWERS = { obsidian: { id: 'demo-notes', name: 'Demo Notes', description: 'Track demo notes.', mobile: false, vue: false } };

test('parseArgs collects positionals and valued flags', () => {
  const args = parseArgs(['apply', '--config', 'a.json', '--dry-run']);
  assert.equal(args._[0], 'apply');
  assert.equal(args.flags.config, 'a.json');
  assert.equal(args.flags.dryRun, true);
});

test('no command prints usage and exits 0', async () => {
  const { io, chunks } = capture();
  const code = await cli([], io);
  assert.equal(code, 0);
  assert.match(chunks.out, /Usage: node setup\.mjs/);
});

test('unknown command exits 2 with usage on stderr', async () => {
  const { io, chunks } = capture();
  const code = await cli(['frobnicate'], io);
  assert.equal(code, 2);
  assert.match(chunks.err, /Unknown command: frobnicate/);
});

test('verify with no --config exits 2', async () => {
  const { io, chunks } = capture();
  assert.equal(await cli(['verify'], io), 2);
  assert.match(chunks.err, /--config is required/);
});

test('obsidian apply on an unsupported host Node exits 2 before writing any files', async () => {
  const p = project(OBS_ANSWERS, '22.12.0'); // in the jsdom 22.0–22.12 gap
  try {
    const code = await cli(['apply', '--config', 'answers.json'], p.io);
    assert.equal(code, 2);
    assert.match(p.chunks.err, /\^22\.13\.0 \|\| >=24\.0\.0/); // documents the real range
    assert.match(p.chunks.err, /22\.12\.0/); // names the host version
    // The gate runs after the (pure) plan but before apply, so nothing is scaffolded.
    assert.ok(!existsSync(join(p.dir, 'manifest.json')), 'no manifest written');
    assert.ok(!existsSync(join(p.dir, 'package.json')), 'no package.json written');
    assert.ok(!existsSync(join(p.dir, 'src')), 'no source tree written');
  } finally {
    p.cleanup();
  }
});

test('obsidian plan/dry-run on an unsupported host Node still previews (no mutation to block)', async () => {
  const p = project(OBS_ANSWERS, '20.11.0');
  try {
    // `plan` and `apply --dry-run` never mutate, so the floor gate must not block them.
    assert.equal(await cli(['plan', '--config', 'answers.json'], p.io), 0);
    assert.equal(await cli(['apply', '--config', 'answers.json', '--dry-run'], p.io), 0);
    assert.doesNotMatch(p.chunks.err, />=22\.13\.0/);
    assert.match(p.chunks.out, /Planned \d+ change/);
  } finally {
    p.cleanup();
  }
});

test('a supported host Node passes the floor gate and applies the obsidian scaffold', async () => {
  const p = project(OBS_ANSWERS, '24.2.0');
  try {
    const code = await cli(['apply', '--config', 'answers.json'], p.io);
    assert.equal(code, 0);
    assert.doesNotMatch(p.chunks.err, /needs Node/);
    assert.ok(existsSync(join(p.dir, 'manifest.json')), 'scaffold applied');
  } finally {
    p.cleanup();
  }
});

test('the host Node floor: a default apply needs ^22.13 || >=24 (eslint/jsdom); fallow-only without lint', async () => {
  // The generic DEFAULT installs eslint 10 (loadOptions defaults lint staging on), which
  // shares jsdom's ^22.13 || >=24 range — so a default apply is gated like obsidian.
  const genBlocked = project({}, '22.0.0'); // eslint on by default → needs 22.13
  const genOk = project({}, '22.13.0');
  const obsBlocked = project(OBS_ANSWERS, '22.0.0'); // jsdom → needs 22.13
  // Lint off → no eslint, so only fallow's bare >=22 applies (22.0 is fine).
  const noLintOk = project({ guardrails: { eslintSeverityStaging: false } }, '22.0.0');
  const noLintBlocked = project({ guardrails: { eslintSeverityStaging: false } }, '20.11.0');
  try {
    assert.equal(await cli(['apply', '--config', 'answers.json'], genBlocked.io), 2);
    assert.match(genBlocked.chunks.err, /\^22\.13\.0 \|\| >=24\.0\.0/); // eslint's range, not bare >=22
    assert.equal(await cli(['apply', '--config', 'answers.json'], genOk.io), 0);
    assert.equal(await cli(['apply', '--config', 'answers.json'], obsBlocked.io), 2);
    assert.match(obsBlocked.chunks.err, /\^22\.13\.0 \|\| >=24\.0\.0/);
    assert.equal(await cli(['apply', '--config', 'answers.json'], noLintOk.io), 0); // fallow allows 22.0
    assert.equal(await cli(['apply', '--config', 'answers.json'], noLintBlocked.io), 2);
    assert.match(noLintBlocked.chunks.err, />=22\.0\.0/); // the bare fallow floor
  } finally {
    genBlocked.cleanup();
    genOk.cleanup();
    obsBlocked.cleanup();
    noLintOk.cleanup();
    noLintBlocked.cleanup();
  }
});

test('Node 23.x is rejected under eslint/jsdom but fine for a fallow-only (lint-off) apply', async () => {
  // eslint 10 and jsdom both support ^22.13 || >=24, so the whole 23.x line is out for
  // obsidian AND the default (eslint-on) generic apply; only a lint-off apply runs on 23.
  const obs = project(OBS_ANSWERS, '23.5.0');
  const genDefault = project({}, '23.5.0'); // eslint on by default → 23.x rejected
  const noLint = project({ guardrails: { eslintSeverityStaging: false } }, '23.5.0'); // fallow only → ok
  try {
    assert.equal(await cli(['apply', '--config', 'answers.json'], obs.io), 2);
    assert.match(obs.chunks.err, /skips the 23\.x line/);
    assert.ok(!existsSync(join(obs.dir, 'manifest.json')), 'nothing written on the 23.x block');
    assert.equal(await cli(['apply', '--config', 'answers.json'], genDefault.io), 2);
    assert.equal(await cli(['apply', '--config', 'answers.json'], noLint.io), 0);
  } finally {
    obs.cleanup();
    genDefault.cleanup();
    noLint.cleanup();
  }
});
