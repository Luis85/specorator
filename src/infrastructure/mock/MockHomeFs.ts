/**
 * Inert/seedable `HomeFsPort` for unit tests + `npm run dev` (P9, SPEC-PV-011).
 * `isAvailable()` → `false` by default (the inert demo posture, REQ-PV-083);
 * `seedHomeFile(path, text)` populates an in-memory fixture + flips availability
 * `true` so the Codex JSONL history legs exercise without `node:fs`. The
 * path-escape rule (SPEC-PV-007) still applies — a seeded/read path outside the
 * declared `HOME_FS_ROOTS` → `Result.err` (EC-PV-7). No `obsidian`, no `node:*`.
 * Total — never throws.
 */
import type { HomeFsPort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { isInsideHomeRoot } from '@/infrastructure/providers/homeFsPath';

export class MockHomeFs implements HomeFsPort {
	private readonly files = new Map<string, string>();
	private available = false;

	/**
	 * Test hook: seed an in-memory home file under a declared root + flip
	 * availability `true`. A path escaping `HOME_FS_ROOTS` is rejected (it never
	 * lands in the fixture store) so the seed cannot mask the path-escape rule.
	 */
	seedHomeFile(relativePath: string, text: string): void {
		if (!isInsideHomeRoot(relativePath)) return;
		this.files.set(this.normalize(relativePath), text);
		this.available = true;
	}

	/** Test hook: force availability without seeding a file. */
	setHomeFsAvailable(available: boolean): void {
		this.available = available;
	}

	isAvailable(): boolean {
		return this.available;
	}

	readFile(relativePath: string): Promise<Result<string>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		const text = this.files.get(this.normalize(relativePath));
		if (text === undefined) {
			return Promise.resolve(err(new Error('file not found')));
		}
		return Promise.resolve(ok(text));
	}

	exists(relativePath: string): Promise<Result<boolean>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		return Promise.resolve(ok(this.files.has(this.normalize(relativePath))));
	}

	listFolders(relativePath: string): Promise<Result<readonly string[]>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		const prefix = `${this.normalize(relativePath)}/`;
		const names = new Set<string>();
		for (const path of this.files.keys()) {
			if (!path.startsWith(prefix)) continue;
			const rest = path.slice(prefix.length);
			const slash = rest.indexOf('/');
			if (slash !== -1) names.add(rest.slice(0, slash));
		}
		return Promise.resolve(ok([...names]));
	}

	/** Collapse `\` → `/` and trim a trailing slash for a stable fixture key. */
	private normalize(relativePath: string): string {
		return relativePath.replace(/\\/g, '/').replace(/\/+$/, '');
	}
}
