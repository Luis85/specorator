/**
 * T-PV-015/016 — the GitHub Pages demo `HomeFsPort` (SPEC-PV-012). Inert:
 * `isAvailable()→false` (no Node `fs`); reads degrade to `ok(absent/empty)` or the
 * path-escape `err`; no `node:fs`.
 *
 * Traces: TEST-PV-083 (LS leg); SPEC-PV-012; REQ-PV-083; NFR-PV-012; EC-PV-7.
 */
import { describe, it, expect } from 'vitest';
import { LocalStorageHomeFs } from '@/infrastructure/localstorage/LocalStorageHomeFs';

describe('LocalStorageHomeFs (TEST-PV-083 LS leg)', () => {
	it('isAvailable() → false (inert demo, no node:fs)', () => {
		expect(new LocalStorageHomeFs().isAvailable()).toBe(false);
	});

	it('exists() under a declared root → ok(false) (inert)', async () => {
		const fs = new LocalStorageHomeFs();
		const res = await fs.exists('.codex/sessions/t.jsonl');
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toBe(false);
	});

	it('listFolders() under a declared root → ok([]) (inert)', async () => {
		const fs = new LocalStorageHomeFs();
		const res = await fs.listFolders('.codex/sessions');
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toEqual([]);
	});

	it('readFile() under a declared root → err (always absent in the demo)', async () => {
		const res = await new LocalStorageHomeFs().readFile('.codex/sessions/t.jsonl');
		expect(res.ok).toBe(false);
	});

	it('a path escaping the roots → err (the path-escape rule, EC-PV-7)', async () => {
		const fs = new LocalStorageHomeFs();
		expect((await fs.readFile('../escape.txt')).ok).toBe(false);
		expect((await fs.exists('.notes/secret.md')).ok).toBe(false);
		expect((await fs.listFolders('/etc')).ok).toBe(false);
	});
});
