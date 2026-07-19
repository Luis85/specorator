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
    assert.match(p.chunks.err, />=22\.13\.0/); // documents the exact floor
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
    assert.doesNotMatch(p.chunks.err, /Obsidian mode needs Node/);
    assert.ok(existsSync(join(p.dir, 'manifest.json')), 'scaffold applied');
  } finally {
    p.cleanup();
  }
});

test('the Node floor is Obsidian-only: a generic apply is never blocked by it', async () => {
  const p = project({}, '20.0.0'); // generic (non-obsidian) harness, ancient Node
  try {
    const code = await cli(['apply', '--config', 'answers.json'], p.io);
    assert.equal(code, 0);
    assert.doesNotMatch(p.chunks.err, /Obsidian mode needs Node/);
  } finally {
    p.cleanup();
  }
});
