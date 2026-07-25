import * as fs from 'fs';
import * as path from 'path';

import { getEnhancedPath, parseEnvironmentVariables } from './env';
import { expandHomePath, parsePathEntries } from './path';

/**
 * True when the path is a real file this host can actually EXECUTE.
 *
 * A regular file is not enough: a partially installed or copied script without
 * `+x` fails at spawn with `EACCES`, so reporting it as a usable CLI would
 * promise a launch that cannot happen. `X_OK` is a no-op on Windows (Node treats
 * it as an existence check), where executability comes from the extension.
 *
 * Deliberately separate from {@link isExistingFile}: the resolvers keep
 * existence-only semantics so provider CLI resolution behavior is unchanged;
 * this is for surfaces that must not over-promise.
 */
export function isExecutableFile(filePath: string): boolean {
  if (!isExistingFile(filePath)) {
    return false;
  }
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const BATCH_EXTENSIONS = /\.(cmd|bat)$/i;
/**
 * A `node` / `node.exe` COMMAND, not the substring. Deliberately excludes
 * `node_modules` (a word char follows, so no boundary) — that appears in every
 * npm shim and would make this always true.
 */
const NODE_INVOCATION = /(?:^|[\s"'\\/])node(?:\.exe)?(?=["'\s]|$)/im;
/** Enough for any real shim; bounded because the pinned path is user-supplied. */
const BATCH_SHIM_READ_BYTES = 8 * 1024;

/**
 * True when a Windows batch shim starts Node internally.
 *
 * npm generates `<name>.cmd` as a wrapper that runs `node "<pkg>/bin/cli.js"`,
 * so the shim is launchable while Node is not reachable and the wrapped command
 * dies immediately. Nothing about the `.cmd` itself shows that — hence the read.
 * Only the head is read: the path can be hand-pinned to any file.
 */
export function batchShimInvokesNode(filePath: string): boolean {
  if (!BATCH_EXTENSIONS.test(filePath.trim())) {
    return false;
  }
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(BATCH_SHIM_READ_BYTES);
    const read = fs.readSync(fd, buffer, 0, BATCH_SHIM_READ_BYTES, 0);
    return NODE_INVOCATION.test(buffer.subarray(0, read).toString('utf8'));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Nothing to do; the probe's answer is already decided.
      }
    }
  }
}

/** True when the path points at a real file on THIS host. */
export function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Expands a user-configured CLI path and returns it only when it points at a real file. */
function resolveConfiguredCliPath(configuredPath: string | undefined): string | null {
  const trimmed = (configuredPath ?? '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const expandedPath = expandHomePath(trimmed);
    return isExistingFile(expandedPath) ? expandedPath : null;
  } catch {
    return null;
  }
}

/**
 * The names a bare command can actually be EXECUTED under, per platform.
 *
 * On Windows, npm (and other installers) drop an extensionless POSIX sh shim
 * beside the real `.cmd` entry point. Windows cannot run that shim, so it is not
 * a candidate at all: picking it up means either naming an unusable file or
 * spawning something that fails. `.exe` leads because it spawns without a shell;
 * `.cmd`/`.bat` need the cmd.exe wrap (see `utils/windowsSpawn`).
 */
export function executableCandidateNames(
  base: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  return platform === 'win32'
    ? [`${base}.exe`, `${base}.cmd`, `${base}.bat`]
    : [base];
}

/**
 * Scans the enhanced PATH for the first RUNNABLE binary among the candidate names.
 *
 * Executability, not mere existence: a non-executable file on PATH is not what
 * the shell would run, so returning it would hand the caller a path that fails
 * at spawn while a working binary further along PATH went unfound. (A configured
 * path is different — `resolveConfiguredCliPath` still accepts any file, so a
 * caller that pins something unusable can say so precisely instead of reporting
 * a bare "not found" for a file the user can see.)
 */
export function findBinaryOnPath(binaryNames: string[], additionalPath?: string): string | null {
  const searchEntries = parsePathEntries(getEnhancedPath(additionalPath));

  for (const dir of searchEntries) {
    if (!dir) continue;

    for (const binaryName of binaryNames) {
      const candidate = path.join(dir, binaryName);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Shared CLI-path resolution cascade: host-scoped configured path, then the
 * legacy single-path setting, then a PATH scan seeded with any PATH override
 * from the provider's custom environment text.
 */
export function resolveConfiguredOrDiscoveredCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string,
  findBinary: (additionalPath?: string) => string | null,
): string | null {
  return resolveConfiguredCliPath(hostnamePath)
    ?? resolveConfiguredCliPath(legacyPath)
    ?? findBinary(parseEnvironmentVariables(envText || '').PATH);
}
