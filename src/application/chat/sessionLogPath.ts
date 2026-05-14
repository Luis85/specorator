/**
 * T-ASM-045 — `resolveSessionLogPath`.
 *
 * Pure, deterministic resolver for the vault-relative path of a per-thread
 * session log. The Specorator chat sidebar mirrors every conversation to a
 * markdown file in the vault so the chat history survives Obsidian restart,
 * is grep-able, and rides Obsidian Sync without the plugin's involvement
 * (REQ-CCS-028; ADR-0031 layer 2).
 *
 * Path shape (per REQ-ASM-032 / SPEC-ASM-001 §6.7 / ADR-0031):
 *
 *   feature !== null  → `<specsFolder>/<feature>/sessions/<sessionId>.md`
 *   feature === null  → `.specorator/sessions/<sessionId>.md`
 *
 * The null-feature fallback is anchored at the vault root (NOT under
 * `<specsFolder>`) so a user who has not yet picked an active feature still
 * gets a deterministic location for chat history. The leading dot keeps the
 * folder unobtrusive in most Obsidian themes (R-ASM-005 mitigation).
 *
 * Pure module: no I/O, no `obsidian` imports, no Node `path` module — the
 * vault uses POSIX-style forward-slash paths and this resolver mirrors that
 * convention by concatenating raw segments. Sanitisation of `feature` and
 * `sessionId` is the caller's responsibility: `feature` is a `Slug`
 * (validated upstream) and `sessionId` is the CLI-issued `system/init`
 * UUID (RES-ASM-001 §F1).
 *
 * Satisfies REQ-ASM-032.
 */

/**
 * Resolve the vault-relative path of a session log.
 *
 * @param feature  Active feature slug, or `null` when no feature is active.
 * @param sessionId  CLI `session_id` (UUID) — used as the file's basename.
 * @param specsFolder  User's configured specs root (default `'specs'`).
 * @returns Vault-relative POSIX path with `.md` extension.
 */
export function resolveSessionLogPath(
  feature: string | null,
  sessionId: string,
  specsFolder: string,
): string {
  if (feature !== null) {
    return `${specsFolder}/${feature}/sessions/${sessionId}.md`
  }
  return `.specorator/sessions/${sessionId}.md`
}
