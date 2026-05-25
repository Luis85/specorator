/**
 * T-CA-021 (RED) — `AddFileContextUseCase` pure file-set ops (SPEC-CA-014).
 * `add(current, path)` returns `current` + `{ path, displayName }` (displayName =
 * basename-without-extension) UNLESS `path` is already present (idempotent no-op,
 * REQ-CA-002, EC-CA-3); `remove(current, path)` returns `current` minus the
 * matching entry (REQ-CA-003, EC-CA-4); both `Result.ok(nextSet)`; an empty path
 * → `Result.err`. No port — pure set math.
 *
 * Fails (RED) until T-CA-022 implements
 * `src/application/chat/attachments/AddFileContextUseCase.ts`.
 *
 * Traces: TEST-CA-001 (add leg), TEST-CA-003 (displayName leg), SPEC-CA-014,
 * REQ-CA-001/002/003, NFR-CA-004, EC-CA-3/4.
 */
import { describe, it, expect } from 'vitest';
import { AddFileContextUseCase } from '@/application/chat/attachments/AddFileContextUseCase';
import type { AttachedFileRef } from '@/domain/chat/attachments';

describe('TEST-CA-001 AddFileContextUseCase.add', () => {
	const useCase = new AddFileContextUseCase();

	it('adds a new file ref to an empty set', () => {
		const result = useCase.add([], 'folder/note.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual<readonly AttachedFileRef[]>([
			{ path: 'folder/note.md', displayName: 'note' },
		]);
	});

	it('TEST-CA-003: displayName is the basename WITHOUT extension', () => {
		const result = useCase.add([], 'a/b/c/report.final.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value[0].displayName).toBe('report.final');
	});

	it('uses the whole basename when there is no extension', () => {
		const result = useCase.add([], 'folder/README');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value[0].displayName).toBe('README');
	});

	it('appends to an existing set, preserving prior entries', () => {
		const current: readonly AttachedFileRef[] = [{ path: 'a.md', displayName: 'a' }];
		const result = useCase.add(current, 'b.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.map((r) => r.path)).toEqual(['a.md', 'b.md']);
	});

	it('EC-CA-3: re-adding an existing path is an idempotent no-op (same membership)', () => {
		const current: readonly AttachedFileRef[] = [{ path: 'a.md', displayName: 'a' }];
		const result = useCase.add(current, 'a.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.map((r) => r.path)).toEqual(['a.md']);
	});

	it('rejects an empty path → Result.err', () => {
		expect(useCase.add([], '').ok).toBe(false);
		expect(useCase.add([], '   ').ok).toBe(false);
	});
});

describe('TEST-CA-001 AddFileContextUseCase.remove', () => {
	const useCase = new AddFileContextUseCase();

	it('EC-CA-4: removes the matching entry', () => {
		const current: readonly AttachedFileRef[] = [
			{ path: 'a.md', displayName: 'a' },
			{ path: 'b.md', displayName: 'b' },
		];
		const result = useCase.remove(current, 'a.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.map((r) => r.path)).toEqual(['b.md']);
	});

	it('removing an absent path leaves the set unchanged', () => {
		const current: readonly AttachedFileRef[] = [{ path: 'a.md', displayName: 'a' }];
		const result = useCase.remove(current, 'zzz.md');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.map((r) => r.path)).toEqual(['a.md']);
	});

	it('rejects an empty path → Result.err', () => {
		expect(useCase.remove([], '').ok).toBe(false);
	});
});
