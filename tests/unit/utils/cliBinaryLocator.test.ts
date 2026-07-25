import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { executableCandidateNames, isExecutableFile } from '@/utils/cliBinaryLocator';

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
