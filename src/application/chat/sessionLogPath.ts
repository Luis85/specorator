/**
 * T-ASM-045 / Q-E.1 — `resolveSessionLogPath`.
 *
 * Pure, deterministic resolver for the vault-relative path of a per-thread
 * session log. The Specorator chat sidebar mirrors every conversation to a
 * markdown file in the vault so the chat history survives Obsidian restart,
 * is grep-able, and rides Obsidian Sync without the plugin's involvement
 * (REQ-CCS-028; ADR-0031 layer 2).
 *
 * Path shape (per REQ-ASM-032 / SPEC-ASM-001 §6.7 / ADR-0031):
 *
 *   feature !== null  → `<specsFolder>/<feature>/sessions/<basename>.md`
 *   feature === null  → `.specorator/sessions/<basename>.md`
 *
 * Q-E.1 makes `<basename>` human-readable. When the caller supplies
 * `createdAt` and `firstUserMessage`, the basename becomes:
 *
 *   <YYYY-MM-DD>_<slug>__<short-uuid>
 *
 * where:
 *   - `<YYYY-MM-DD>` is the UTC date derived from `createdAt` (ISO 8601).
 *   - `<slug>` is `slugifyForSessionLog(firstUserMessage)` — `'untitled'` if
 *     the message is empty/symbol-only.
 *   - `<short-uuid>` is the first 8 characters of `sessionId`, guaranteeing
 *     uniqueness even when two threads on the same day share the same slug.
 *
 * Backwards-compatible: callers that omit `createdAt` / `firstUserMessage`
 * still receive the legacy `<sessionId>.md` shape. This is load-bearing
 * because pre-Q-E.1 session files already exist in user vaults with the
 * UUID-only basename, and the writer's conflict-suffix loop must still
 * resolve them via the same path computation when `firstUserMessage` is
 * unknown (e.g. before the very first user turn lands).
 *
 * The null-feature fallback is anchored at the vault root (NOT under
 * `<specsFolder>`) so a user who has not yet picked an active feature still
 * gets a deterministic location for chat history. The leading dot keeps the
 * folder unobtrusive in most Obsidian themes (R-ASM-005 mitigation).
 *
 * Pure module: no I/O, no `obsidian` imports, no Node `path` module — the
 * vault uses POSIX-style forward-slash paths and this resolver mirrors that
 * convention by concatenating raw segments. Sanitisation of `feature` is the
 * caller's responsibility; `sessionId` is the CLI-issued `system/init`
 * UUID (RES-ASM-001 §F1); `firstUserMessage` is sluggified internally.
 *
 * Satisfies REQ-ASM-032.
 */

import { slugifyForSessionLog } from '@/application/chat/sessionLogSlug'

/**
 * Optional arguments enabling the Q-E.1 human-readable basename. Omit both
 * fields to get the legacy `<sessionId>.md` shape (used by the writer for
 * conflict-suffix resolution on pre-existing UUID-named files).
 */
export interface SessionLogPathOptions {
	/** Thread creation timestamp (ISO 8601). Date component used as the prefix. */
	readonly createdAt?: string
	/** First user message text. Sluggified for the basename's middle segment. */
	readonly firstUserMessage?: string
}

function deriveBasename(
	sessionId: string,
	options: SessionLogPathOptions | undefined,
): string {
	const createdAt = options?.createdAt
	const firstUserMessage = options?.firstUserMessage
	if (createdAt === undefined && firstUserMessage === undefined) {
		// Legacy shape — preserves backward compatibility for existing files
		// and for the writer's conflict-suffix resolution path.
		return sessionId
	}
	const date =
		createdAt !== undefined && createdAt !== ''
			? extractIsoDate(createdAt)
			: 'unknown-date'
	const slug = slugifyForSessionLog(firstUserMessage ?? '')
	const shortUuid = sessionId.slice(0, 8)
	return `${date}_${slug}__${shortUuid}`
}

/**
 * Extract the `YYYY-MM-DD` UTC date prefix from an ISO 8601 timestamp.
 * Defensive: returns `'unknown-date'` if the input is malformed, so the
 * resolver stays total.
 */
function extractIsoDate(isoTimestamp: string): string {
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoTimestamp)
	return match === null ? 'unknown-date' : match[1]
}

/**
 * Resolve the vault-relative path of a session log.
 *
 * @param feature  Active feature slug, or `null` when no feature is active.
 * @param sessionId  CLI `session_id` (UUID) — supplies the short-uuid suffix
 *                   (Q-E.1) or, in legacy callers, the full basename.
 * @param specsFolder  User's configured specs root (default `'specs'`).
 * @param options  Optional Q-E.1 inputs for the human-readable basename.
 * @returns Vault-relative POSIX path with `.md` extension.
 */
export function resolveSessionLogPath(
	feature: string | null,
	sessionId: string,
	specsFolder: string,
	options?: SessionLogPathOptions,
): string {
	const basename = deriveBasename(sessionId, options)
	if (feature !== null) {
		return `${specsFolder}/${feature}/sessions/${basename}.md`
	}
	return `.specorator/sessions/${basename}.md`
}
