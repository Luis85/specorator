/**
 * T-PV-013/014 — the inert/seedable Mock `HomeFsPort` (SPEC-PV-011). Inert by
 * default (`isAvailable()→false`); `seedHomeFile` populates an in-memory fixture +
 * flips availability; the path-escape rule (SPEC-PV-007/028) still rejects reads
 * outside `HOME_FS_ROOTS`. No `node:fs`.
 *
 * Traces: TEST-PV-080/081/083; SPEC-PV-007/011; REQ-PV-080..083; EC-PV-7.
 */
import { describe, it, expect } from 'vitest';
import { MockHomeFs } from '@/infrastructure/mock/MockHomeFs';

describe('MockHomeFs (TEST-PV-080/081/083, EC-PV-7)', () => {
	it('isAvailable() → false by default (inert demo posture, REQ-PV-083)', () => {
		expect(new MockHomeFs().isAvailable()).toBe(false);
	});

	it('seedHomeFile populates a fixture under a declared root + flips availability', async () => {
		const fs = new MockHomeFs();
		fs.seedHomeFile('.codex/sessions/2026/turn.jsonl', '{"role":"user"}');
		expect(fs.isAvailable()).toBe(true);
		const read = await fs.readFile('.codex/sessions/2026/turn.jsonl');
		expect(read.ok).toBe(true);
		if (read.ok) expect(read.value).toBe('{"role":"user"}');
	});

	it('exists() reports a seeded path / a missing path (TEST-PV-080)', async () => {
		const fs = new MockHomeFs();
		fs.seedHomeFile('.claude/projects/a.json', '{}');
		expect((await fs.exists('.claude/projects/a.json')).ok).toBe(true);
		const present = await fs.exists('.claude/projects/a.json');
		if (present.ok) expect(present.value).toBe(true);
		const absent = await fs.exists('.claude/projects/missing.json');
		if (absent.ok) expect(absent.value).toBe(false);
	});

	it('listFolders() lists child folder names under a declared root (TEST-PV-080)', async () => {
		const fs = new MockHomeFs();
		fs.seedHomeFile('.codex/sessions/a/turn.jsonl', '{}');
		fs.seedHomeFile('.codex/sessions/b/turn.jsonl', '{}');
		const folders = await fs.listFolders('.codex/sessions');
		expect(folders.ok).toBe(true);
		if (folders.ok) expect([...folders.value].sort()).toEqual(['a', 'b']);
	});

	it('a path escaping the roots → err (the path-escape rule, EC-PV-7, TEST-PV-081)', async () => {
		const fs = new MockHomeFs();
		fs.seedHomeFile('.codex/sessions/turn.jsonl', '{}');
		expect((await fs.readFile('.codex/../.ssh/id_rsa')).ok).toBe(false);
		expect((await fs.readFile('../outside.txt')).ok).toBe(false);
		expect((await fs.readFile('.notes/secret.md')).ok).toBe(false);
		expect((await fs.exists('/etc/passwd')).ok).toBe(false);
	});

	it('a seeded path outside the roots is ignored (cannot mask the escape rule, EC-PV-7)', () => {
		const fs = new MockHomeFs();
		fs.seedHomeFile('.notes/secret.md', 'x');
		// the out-of-root seed never flips availability.
		expect(fs.isAvailable()).toBe(false);
	});
});
