/**
 * T-ASM-057 — `useSessionLogWriter` composable.
 *
 * Constructs and memoises a {@link SessionLogWriter} for the active component
 * tree. The writer is bound to the current `VaultPort` + `LoggerPort` + the
 * `specsFolder` resolved from {@link SettingsPort.getSettings} (REQ-ASM-038).
 *
 * The writer is intentionally created per consumer rather than provided
 * globally:
 *   - It carries per-instance mutexes and conflict-suffix memoisation
 *     (SPEC-ASM-001 §6.7). Sharing across consumers via `provide`/`inject` is
 *     a future optimisation; in v1 the panel is mounted in a single view so a
 *     fresh writer per mount is correct.
 *   - Construction is cheap: no I/O, just three field assignments.
 *
 * Returns a small accessor object so callers can fire-and-forget
 * `appendUserAssistant` from `ChatSidebar.handleSend` without awaiting the
 * underlying vault writes (REQ-ASM-040).
 *
 * Pure UI-layer composable: imports only narrow ports + the application-layer
 * writer class. No `obsidian` imports.
 */
import { SessionLogWriter } from '@/application/chat/SessionLogWriter'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'

export interface UseSessionLogWriter {
	/**
	 * Returns the lazily-constructed {@link SessionLogWriter}. The writer is
	 * cached on first call; subsequent calls return the same instance so the
	 * per-log-file mutex map serialises correctly (REQ-ASM-040).
	 */
	getWriter(): Promise<SessionLogWriter>
}

export function useSessionLogWriter(): UseSessionLogWriter {
	const vault = useVaultPort()
	const logger = useLoggerPort()
	const settings = useSettingsPort()
	let cached: SessionLogWriter | null = null
	let cachedSpecsFolder: string | null = null
	// Shared in-flight initialization promise (Codex P1, PR #350). Without
	// this, two concurrent callers each `await settings.getSettings()` before
	// reading `cached`; both can observe `cached === null` and construct
	// different SessionLogWriter instances. Because the per-log-file mutex
	// lives on each writer instance, the two writers do not coordinate locks
	// and can interleave read/append/write cycles on the same log, dropping
	// entries. Gating the construction path behind a single Promise ensures
	// every concurrent caller gets the same writer.
	let inFlight: Promise<SessionLogWriter> | null = null

	return {
		getWriter(): Promise<SessionLogWriter> {
			if (inFlight !== null) return inFlight
			const pending = (async (): Promise<SessionLogWriter> => {
				const current = await settings.getSettings()
				// Invalidate the cached writer when the configured specs folder has
				// changed mid-session (Codex P2, PR #350). Without this, a user
				// who changes the Specs folder in settings keeps writing session
				// logs to the old folder while stage/context resolution uses the
				// new one, splitting history across roots.
				if (cached === null || cachedSpecsFolder !== current.specsFolder) {
					cached = new SessionLogWriter(
						vault,
						logger,
						current.specsFolder,
						() => new Date().toISOString(),
					)
					cachedSpecsFolder = current.specsFolder
				}
				return cached
			})()
			// Clear `inFlight` once construction settles so a subsequent
			// `specsFolder` change can be re-detected on the next call. `.finally`
			// preserves both resolution value and rejection, and avoids a raw
			// try/finally block (`no-restricted-syntax` rule).
			inFlight = pending.finally(() => {
				inFlight = null
			})
			return inFlight
		},
	}
}
