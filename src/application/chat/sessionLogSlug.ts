/**
 * Q-E.1 — Pure slug helper for session-log filenames.
 *
 * Sluggifies an arbitrary user string (typically the first user message of a
 * thread) into a filesystem-safe, vault-portable component:
 *
 *   - Unicode is normalised (`NFKD`) and stripped of combining marks so
 *     diacritics collapse to ASCII letters (`Ü` → `U`, `é` → `e`).
 *   - Non-ASCII codepoints that survive the strip (emoji, CJK, etc.) are
 *     dropped — we do not transliterate, we just lower the noise.
 *   - The result is lowercased.
 *   - Anything not in `[a-z0-9]` becomes a single `-`.
 *   - Runs of `-` are collapsed; leading/trailing `-` are trimmed.
 *   - Truncated to `maxLen` characters (default 40), then re-trimmed of
 *     trailing `-` so a mid-word cut does not leave a dangling dash.
 *   - If the result is empty (input was all symbols / unicode / whitespace),
 *     returns `'untitled'`.
 *
 * No I/O, no `Date.now()`, no `obsidian`. Deterministic for the same input.
 */

/**
 * Slugify `text` for use as a filename component. See module header for the
 * exact normalisation steps.
 */
export function slugifyForSessionLog(text: string, maxLen = 40): string {
	const normalised = text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip combining marks
		.toLowerCase()
	// Keep ASCII alphanumerics; collapse everything else to single dashes.
	const asciiOnly = normalised.replace(/[^a-z0-9]+/g, '-')
	const trimmed = asciiOnly.replace(/^-+|-+$/g, '')
	if (trimmed === '') return 'untitled'
	const clipped = trimmed.slice(0, maxLen).replace(/-+$/g, '')
	return clipped === '' ? 'untitled' : clipped
}
