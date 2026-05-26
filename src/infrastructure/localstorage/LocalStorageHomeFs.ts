/**
 * The GitHub Pages demo `HomeFsPort` (P9, SPEC-PV-012). Inert — there is no Node
 * `fs`/`os.homedir()` in the browser demo, so `isAvailable()` → `false`
 * (REQ-PV-083, NFR-PV-012) and every read degrades to `ok(absent/empty)` rather
 * than touching a filesystem. The path-escape rule (SPEC-PV-007) still rejects a
 * read outside `HOME_FS_ROOTS` so the demo posture matches the real contract.
 * Never throws. No `node:*`.
 */
import type { HomeFsPort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { isInsideHomeRoot } from '@/infrastructure/providers/homeFsPath';

export class LocalStorageHomeFs implements HomeFsPort {
	isAvailable(): boolean {
		return false;
	}

	readFile(relativePath: string): Promise<Result<string>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		// Inert demo: no beyond-vault filesystem → the file is always absent.
		return Promise.resolve(err(new Error('home filesystem unavailable in the demo')));
	}

	exists(relativePath: string): Promise<Result<boolean>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		return Promise.resolve(ok(false));
	}

	listFolders(relativePath: string): Promise<Result<readonly string[]>> {
		if (!isInsideHomeRoot(relativePath)) {
			return Promise.resolve(err(new Error('path escapes the declared home roots')));
		}
		return Promise.resolve(ok([]));
	}
}
