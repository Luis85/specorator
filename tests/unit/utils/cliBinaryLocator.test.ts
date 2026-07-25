import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  batchShimInvokesNode,
  executableCandidateNames,
  findBinaryOnPath,
  isExecutableFile,
} from '@/utils/cliBinaryLocator';

/**
 * The single definition of "which names can this platform actually run", shared
 * by provider detection and the in-app installer's package-manager lookup. Both
 * previously tried the bare name first on Windows, which resolves npm's
 * extensionless sh shim — a file Windows cannot execute and that the batch-shim
 * wrap does not catch, so detection named an unusable path and the install failed.
 */
describe('executableCandidateNames', () => {
  it('is just the bare name off Windows, where extensionless binaries are the norm', () => {
    expect(executableCandidateNames('opencode', 'darwin')).toEqual(['opencode']);
    expect(executableCandidateNames('opencode', 'linux')).toEqual(['opencode']);
  });

  it('excludes the bare name on Windows and leads with the shell-free .exe', () => {
    expect(executableCandidateNames('npm', 'win32')).toEqual([
      'npm.exe',
      'npm.cmd',
      'npm.bat',
    ]);
  });
});

describe('isExecutableFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-exec-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a file the host can run', () => {
    const file = path.join(dir, 'runnable');
    fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o755 });

    expect(isExecutableFile(file)).toBe(true);
  });

  it('rejects a regular file without execute permission', () => {
    // A partially installed or copied script: it exists, so an
    // existence-only check would report the provider ready, and the runtime
    // would then fail to spawn it with EACCES.
    const file = path.join(dir, 'not-runnable');
    fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o644 });

    expect(isExecutableFile(file)).toBe(process.platform === 'win32');
  });

  it('rejects a directory and a missing path', () => {
    expect(isExecutableFile(dir)).toBe(false);
    expect(isExecutableFile(path.join(dir, 'nope'))).toBe(false);
  });
});

/** POSIX-only: `X_OK` is an existence check on Windows, so there is nothing to skip. */
const itPosix = process.platform === 'win32' ? it.skip : it;

describe('findBinaryOnPath', () => {
  let dir: string;
  let other: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-path-a-'));
    other = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-path-b-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  });

  itPosix('skips a non-executable hit and keeps scanning', () => {
    // Returning the first *existing* file would hand back a path that fails at
    // spawn while the working binary further along PATH went unfound — and the
    // setup view would report the provider ready off it.
    fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\n', { mode: 0o644 });
    const runnable = path.join(other, 'tool');
    fs.writeFileSync(runnable, '#!/bin/sh\n', { mode: 0o755 });

    expect(findBinaryOnPath(['tool'], `${dir}${path.delimiter}${other}`)).toBe(runnable);
  });

  itPosix('returns null when every hit is unusable', () => {
    fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\n', { mode: 0o644 });

    expect(findBinaryOnPath(['tool'], dir)).toBeNull();
  });
});

/**
 * npm generates `<name>.cmd` as a wrapper that runs `node "<pkg>/bin/cli.js"`.
 * cmd.exe starts that shim happily whether or not Node is reachable, and the
 * wrapped command then dies — so "the provider can wrap batch files" is not on
 * its own enough to call the CLI ready.
 */
describe('batchShimInvokesNode', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-shim-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeShim(name: string, body: string): string {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, body);
    return filePath;
  }

  it('recognizes the npm-generated wrapper', () => {
    const shim = writeShim('codex.cmd', [
      '@ECHO off',
      'IF EXIST "%~dp0\\node.exe" (',
      '  "%~dp0\\node.exe"  "%~dp0\\..\\pkg\\bin\\cli.js" %*',
      ') ELSE (',
      '  node  "%~dp0\\..\\pkg\\bin\\cli.js" %*',
      ')',
    ].join('\r\n'));

    expect(batchShimInvokesNode(shim)).toBe(true);
  });

  it('does not fire on `node_modules` alone, which every shim mentions', () => {
    // A substring match would make this always true and turn a missing Node into
    // a blanket verdict on every batch-launched CLI.
    const shim = writeShim('native.cmd', '@"%~dp0\\..\\node_modules\\pkg\\native.exe" %*');

    expect(batchShimInvokesNode(shim)).toBe(false);
  });

  it('ignores anything that is not a batch shim, without reading it', () => {
    expect(batchShimInvokesNode(writeShim('cli.exe', 'node'))).toBe(false);
  });

  it('answers false for a path it cannot read rather than throwing', () => {
    expect(batchShimInvokesNode(path.join(dir, 'absent.cmd'))).toBe(false);
  });
});
