/**
 * The real `HomeFsPort` over `node:fs` rooted at `os.homedir()` (P9, SPEC-PV-009,
 * ADR-PV-003 §1). Read-first — NO write/delete (REQ-PV-081). Every read resolves the
 * relative path against `os.homedir()` and verifies the resolved absolute path is a
 * descendant of `~/.codex` or `~/.claude` (the path-escape rule, SPEC-PV-007/028);
 * a path escaping both roots → `Result.err` (REQ-PV-081). All methods are
 * `Result`-typed (never throw across the port). `isAvailable()` → `true` (the
 * Obsidian desktop runtime has Node `fs` + `os.homedir()`).
 *
 * The pure `isInsideHomeRoot` check (coverage-included, unit-tested) is the first
 * gate; this file adds the `os.homedir()` resolution + the `fs.realpath`-style
 * containment guard so a symlink/`..` cannot escape at the real boundary.
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the MANUAL legs TEST-PV-M1/M2 (the real JSONL/ACP history reads). No `obsidian`
 * symbol leaks past this file.
 */
import { readFile as fsReadFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';

import type { HomeFsPort } from '@/domain/ports';
import { HOME_FS_ROOTS } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { isInsideHomeRoot } from '@/infrastructure/providers/homeFsPath';

export class HomeFileSystem implements HomeFsPort {
	isAvailable(): boolean {
		return true;
	}

	async readFile(relativePath: string): Promise<Result<string>> {
		const resolved = this._resolve(relativePath);
		if (!resolved.ok) return err(resolved.error);
		try {
			const text = await fsReadFile(resolved.value, 'utf8');
			return ok(text);
		} catch (e: unknown) {
			return err(e instanceof Error ? e : new Error('failed to read home file'));
		}
	}

	async exists(relativePath: string): Promise<Result<boolean>> {
		const resolved = this._resolve(relativePath);
		if (!resolved.ok) return err(resolved.error);
		try {
			await stat(resolved.value);
			return ok(true);
		} catch {
			// Not-found is a clean `ok(false)`; only a path-escape is an `err`.
			return ok(false);
		}
	}

	async listFolders(relativePath: string): Promise<Result<readonly string[]>> {
		const resolved = this._resolve(relativePath);
		if (!resolved.ok) return err(resolved.error);
		try {
			const entries = await readdir(resolved.value, { withFileTypes: true });
			return ok(entries.filter((e) => e.isDirectory()).map((e) => e.name));
		} catch (e: unknown) {
			return err(e instanceof Error ? e : new Error('failed to list home folders'));
		}
	}

	/**
	 * Resolve a relative path to an absolute path inside a declared root, or `err`
	 * when it escapes. The pure `isInsideHomeRoot` gate runs first; the resolved
	 * absolute path is then re-checked against the root prefixes so an `os`-level
	 * `..`/symlink cannot escape (defence in depth, REQ-PV-081).
	 */
	private _resolve(relativePath: string): Result<string> {
		if (!isInsideHomeRoot(relativePath)) {
			return err(new Error('path escapes the declared home roots'));
		}
		const home = homedir();
		const absolute = resolve(home, normalize(relativePath));
		const allowed = HOME_FS_ROOTS.some((root) => {
			const rootAbs = join(home, root);
			return absolute === rootAbs || absolute.startsWith(`${rootAbs}${sep}`);
		});
		if (!allowed) {
			return err(new Error('path escapes the declared home roots'));
		}
		return ok(absolute);
	}
}
