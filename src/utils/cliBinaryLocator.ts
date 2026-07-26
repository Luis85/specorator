import * as fs from 'fs';
import * as path from 'path';

import { pickEnvValueCaseInsensitive } from '@/core/providers/subprocessEnvironmentAllowlist';

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
  return BATCH_EXTENSIONS.test(filePath.trim())
    && NODE_INVOCATION.test(readFileHead(filePath) ?? '');
}

/** Reads the head of a file, or null if it cannot be read. Bounded: the path is user-supplied. */
function readFileHead(filePath: string): string | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(BATCH_SHIM_READ_BYTES);
    const read = fs.readSync(fd, buffer, 0, BATCH_SHIM_READ_BYTES, 0);
    return buffer.subarray(0, read).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Nothing to do; the caller's answer is already decided.
      }
    }
  }
}

/** Drive-letter or UNC prefix — what makes a Windows path absolute. */
const WINDOWS_ABSOLUTE_PREFIX = String.raw`(?:[A-Za-z]:[\\/]|\\\\)`;
/** A quoted absolute Node path, e.g. `"C:\Program Files\nodejs\node.exe"` — spaces allowed. */
const QUOTED_ABSOLUTE_NODE = new RegExp(
  String.raw`["'](${WINDOWS_ABSOLUTE_PREFIX}[^"'\r\n]*node(?:\.exe)?)["']`,
  'i',
);
/**
 * The same thing written without quotes, e.g. `C:\tools\node.exe cli.js`. Legal
 * in a shim as long as the path has no spaces — which is exactly why it cannot
 * reuse the quoted pattern: the terminator is whitespace, not a closing quote.
 */
const UNQUOTED_ABSOLUTE_NODE = new RegExp(
  String.raw`(?:^|[\s@(])(${WINDOWS_ABSOLUTE_PREFIX}[^\s"'\r\n]*node(?:\.exe)?)(?=[\s"']|$)`,
  'im',
);
/** A shebang interpreter given as an absolute path — the only kind the kernel uses verbatim. */
const ABSOLUTE_SHEBANG_INTERPRETER = /^\/\S+$/;
/**
 * `env` — the one interpreter that exists to look its argument up on PATH.
 *
 * Identified by exclusion rather than by matching an allow-list of Node names,
 * because the question is "does this bypass PATH?", not "is this really Node".
 * An allow-list has to guess every alias a distribution ships (`nodejs` on
 * Debian, a versioned `node20`, a vendored bundle) and reports `missing-node`
 * for a script the kernel launches fine whenever it guesses short.
 */
const PATH_DEFERRING_INTERPRETER = /(?:^|\/)env(?:\.exe)?$/i;

/**
 * The interpreter an entry point names OUTRIGHT, when it names one — the file
 * that must be runnable for it to start, in place of any PATH search.
 *
 * `#!/opt/node/bin/node` is launched by the kernel through that exact path and
 * never consults PATH, so requiring a PATH hit would report a script that runs
 * perfectly as `missing-node` and offer a reinstall for it. Same for a batch shim
 * that hard-codes an absolute `node.exe`.
 *
 * Returns null for `#!/usr/bin/env node` and for a bare `node` in a shim — those
 * genuinely resolve through PATH, so the PATH search remains the right question.
 */
export function declaredInterpreter(filePath: string): string | null {
  const head = readFileHead(filePath);
  if (head === null) {
    return null;
  }
  if (BATCH_EXTENSIONS.test(filePath.trim())) {
    return QUOTED_ABSOLUTE_NODE.exec(head)?.[1]
      ?? UNQUOTED_ABSOLUTE_NODE.exec(head)?.[1]
      ?? null;
  }
  if (!head.startsWith('#!')) {
    return null;
  }
  const [interpreter] = head.split(/\r?\n/)[0].slice(2).trim().split(/\s+/);
  if (!interpreter || !ABSOLUTE_SHEBANG_INTERPRETER.test(interpreter)) {
    return null;
  }
  return PATH_DEFERRING_INTERPRETER.test(interpreter) ? null : interpreter;
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
    // Case-insensitive, like every runtime that builds the spawn env from the
    // same text: a provider Environment entered as `Path=` IS the user's PATH on
    // Windows, so an exact-key read made this resolver answer `null` for a CLI
    // the runtime then launched fine — and the setup view, reading it
    // case-insensitively, disagreed with the resolver about the same install.
    ?? findBinary(pickEnvValueCaseInsensitive(parseEnvironmentVariables(envText || ''), 'PATH'));
}
