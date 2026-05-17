/**
 * WP-9 Track 2 — defense-in-depth guard for the subprocess transport.
 *
 * `buildSubprocessArgs` enforces structural invariants on the *argv* vector
 * (INV-1…INV-6), and `ClaudeBinaryResolver` enforces that the resolved path is
 * absolute. This module is the centralised gate between the two — a single
 * predicate that both subprocess entry points (`queryStream` and
 * `runSubprocessStructured`) call BEFORE `lifecycle.spawn`, so a future
 * code-path that lets the user supply a custom binary path cannot silently
 * spawn `/bin/sh`, `cmd.exe`, or a relative ad-hoc command.
 *
 * What we reject:
 *   - Non-absolute paths (covers `claude`, `./claude`, `npx claude`, env-var
 *     interpolations that fail to resolve).
 *   - Common shell binaries: `/bin/sh`, `/bin/bash`, `/usr/bin/sh`,
 *     `/usr/bin/bash`, `/bin/zsh`, `/usr/bin/zsh`, `cmd.exe`, `powershell.exe`,
 *     `pwsh.exe`. These are not what the resolver should ever return — if any
 *     of these arrive, something is wrong upstream.
 *   - Binaries whose basename does not match `claude(-code)?(.exe|.cmd)?`. We
 *     deliberately keep the regex narrow; if a future legitimate alias (e.g.
 *     `npx claude`) is needed, this gate must be loosened explicitly, which
 *     forces the security review to happen.
 *
 * What we **do not** reject:
 *   - Shell metacharacters anywhere in the path. `SubprocessLifecycle.spawn()`
 *     calls `child_process.spawn()` without `shell: true`, so the path is
 *     passed to the kernel as opaque bytes — `&`, `$`, `;`, etc. are
 *     legitimate filename characters on both POSIX and Windows filesystems
 *     and never get shell-interpreted. Rejecting them was overreach and
 *     turned legitimate install paths (e.g. `/Users/me/Apps & Tools/claude`)
 *     into hard launch failures (Codex P2 review on PR #405).
 *
 * Returns a `Result<void, ClaudeCliError>` (ADR-004). On rejection the error
 * code is `CLI_LAUNCH_FAILED` so the call site can re-use the existing UI
 * copy — `Chat needs the Claude command-line tool.` — without introducing a
 * new user-facing error string. The technical message field carries the
 * spawn-guard detail for log-only surfaces.
 */
import * as path from 'node:path';

import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort';
import { err, ok, type Result } from '@/domain/shared/Result';

/**
 * Cross-platform absolute-path check. POSIX accepts `/usr/local/bin/claude`;
 * Windows accepts `C:\\Program Files\\Claude\\claude.exe`. We accept either
 * shape regardless of host OS so this guard is hermetically testable.
 */
function isAbsoluteCrossPlatform(p: string): boolean {
	return path.posix.isAbsolute(p) || path.win32.isAbsolute(p);
}

/**
 * Cross-platform basename extraction — picks the last segment after either
 * `/` or `\\`. Avoids the platform-specific behaviour of `path.basename`
 * which only recognises one separator family at a time.
 */
function basenameCrossPlatform(p: string): string {
	const lastSlash = p.lastIndexOf('/');
	const lastBackslash = p.lastIndexOf('\\');
	const lastSep = Math.max(lastSlash, lastBackslash);
	return lastSep === -1 ? p : p.slice(lastSep + 1);
}

/**
 * Basenames that this guard refuses to spawn even if the caller hands them an
 * absolute path. Matched case-insensitively against the basename only — the
 * directory portion is irrelevant (an attacker who controls one segment
 * controls them all).
 */
const FORBIDDEN_BASENAMES: ReadonlySet<string> = new Set([
	'sh',
	'bash',
	'zsh',
	'dash',
	'fish',
	'ksh',
	'csh',
	'tcsh',
	'cmd.exe',
	'powershell.exe',
	'pwsh.exe',
	'wsl.exe',
	'env',
	'node',
	'node.exe',
]);

/**
 * The `claude` binary basename family this guard accepts. Anchored at both
 * ends; case-insensitive on the optional `.exe` / `.cmd` Windows suffix.
 */
const CLAUDE_BASENAME_RE = /^claude(-code)?(\.exe|\.cmd|\.bat)?$/i;

/**
 * Predicate: is `binaryPath` safe to hand to `child_process.spawn` for the
 * Claude transport?
 *
 * Returns `ok(void)` when the path passes every gate; otherwise returns
 * `err(ClaudeCliError)` with code `CLI_LAUNCH_FAILED` and a technical message
 * naming which gate failed. The technical message MUST NOT be surfaced to
 * end users verbatim — call sites should log it and emit the standard
 * `CLI_LAUNCH_FAILED` UI copy.
 */
export function assertSpawnable(binaryPath: string): Result<void, ClaudeCliError> {
	if (typeof binaryPath !== 'string' || binaryPath.length === 0) {
		return err(
			new ClaudeCliError(
				'CLI_LAUNCH_FAILED',
				'SPAWN_GUARD_FAILED: binary path is empty',
			),
		);
	}

	if (!isAbsoluteCrossPlatform(binaryPath)) {
		return err(
			new ClaudeCliError(
				'CLI_LAUNCH_FAILED',
				'SPAWN_GUARD_FAILED: binary path must be absolute',
			),
		);
	}

	const basename = basenameCrossPlatform(binaryPath).toLowerCase();

	if (FORBIDDEN_BASENAMES.has(basename)) {
		return err(
			new ClaudeCliError(
				'CLI_LAUNCH_FAILED',
				'SPAWN_GUARD_FAILED: refusing to spawn shell or interpreter',
			),
		);
	}

	if (!CLAUDE_BASENAME_RE.test(basename)) {
		return err(
			new ClaudeCliError(
				'CLI_LAUNCH_FAILED',
				'SPAWN_GUARD_FAILED: binary basename does not match claude(-code)?(.exe|.cmd)?',
			),
		);
	}

	return ok(undefined);
}
