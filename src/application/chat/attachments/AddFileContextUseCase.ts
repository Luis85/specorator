import { ok, err, type Result } from '@/domain/shared/Result';
import type { AttachedFileRef } from '@/domain/chat/attachments';

/**
 * Pure file-set ops driving the attached-file chip state (SPEC-CA-014,
 * REQ-CA-001/002/003). Claudian ground-truth: `FileContextState.attachFile:48` /
 * `detachFile:52`. The per-tab set lives in the store (ADR-CA-001 §2); this use
 * case computes the next set. **No port** — pure set math; `Result`-returning,
 * never throws (NFR-CA-004). No `obsidian`/Vue import.
 */
export class AddFileContextUseCase {
	/**
	 * Add a path to the set (idempotent — REQ-CA-002, EC-CA-3). Builds the
	 * `AttachedFileRef` with `displayName` = basename-without-extension. A re-add of
	 * an already-present path returns the same membership; an empty path → `err`.
	 */
	add(current: readonly AttachedFileRef[], path: string): Result<readonly AttachedFileRef[]> {
		if (path.trim() === '') return err(new Error('Cannot attach a file with an empty path.'));
		if (current.some((ref) => ref.path === path)) return ok(current);
		return ok([...current, { path, displayName: basenameWithoutExtension(path) }]);
	}

	/** Remove a path from the set (REQ-CA-003, EC-CA-4). An empty path → `err`. */
	remove(current: readonly AttachedFileRef[], path: string): Result<readonly AttachedFileRef[]> {
		if (path.trim() === '') return err(new Error('Cannot remove a file with an empty path.'));
		return ok(current.filter((ref) => ref.path !== path));
	}
}

/**
 * The chip label (SPEC-CA-002/019): the path's basename with the final extension
 * stripped (`folder/report.final.md` → `report.final`; `folder/README` →
 * `README`). Pure/total.
 */
function basenameWithoutExtension(path: string): string {
	const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	const basename = slash >= 0 ? path.slice(slash + 1) : path;
	const dot = basename.lastIndexOf('.');
	// A leading dot (dotfile, no real extension) keeps the whole name.
	return dot > 0 ? basename.slice(0, dot) : basename;
}
