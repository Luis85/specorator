/**
 * Pure path-escape check for the `HomeFsPort` (P9, SPEC-PV-007, SPEC-PV-028). The
 * declared `HOME_FS_ROOTS` (`.codex`, `.claude`) are the only beyond-vault roots a
 * P9 read may touch; a `relativePath` whose normalised form escapes both roots (a
 * `..` traversal, an absolute path, a different first segment) must be rejected by
 * the caller as `Result.err`. Pure + total — no I/O, no `node:*`, no `obsidian`.
 *
 * Shared by the inert/seedable Mock home-fs (coverage-included) + the real
 * `node:fs` `HomeFileSystem` (coverage-excluded), so the rule has one source of
 * truth and the Mock proves it under the automated suite (TEST-PV-080/081/083,
 * EC-PV-7).
 */
import { HOME_FS_ROOTS } from '@/domain/ports';

/** Normalise a `/`/`\`-separated relative path, collapsing `.` and resolving `..`. */
function normalizeSegments(relativePath: string): string[] | null {
	const raw = relativePath.replace(/\\/g, '/');
	// An absolute path (POSIX `/…` or Windows `C:/…`) is never inside a home root.
	if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return null;
	const out: string[] = [];
	for (const segment of raw.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			// A `..` that pops past the start escapes the root → reject.
			if (out.length === 0) return null;
			out.pop();
			continue;
		}
		out.push(segment);
	}
	return out;
}

/**
 * Whether `relativePath` resolves inside one of the declared `HOME_FS_ROOTS`
 * (SPEC-PV-007). A root itself (`.codex`) is in-bounds; a descendant
 * (`.codex/sessions`) is in-bounds; a `..` escape / absolute path / unknown first
 * segment is out of bounds → the caller returns `Result.err` (REQ-PV-081).
 */
export function isInsideHomeRoot(relativePath: string): boolean {
	const segments = normalizeSegments(relativePath);
	if (segments === null || segments.length === 0) return false;
	return (HOME_FS_ROOTS as readonly string[]).includes(segments[0]);
}
