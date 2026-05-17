/**
 * T-ASM-057 — `useSessionLogMirror` composable (renamed from
 * `useSessionLogWriter` in WP-5).
 *
 * Constructs and memoises a {@link SessionLogMirror} for the active
 * component tree. The mirror wraps a {@link SessionLogWriter} bound to the
 * current `VaultPort` + `LoggerPort` + the `specsFolder` resolved from
 * {@link SettingsPort.getSettings} (REQ-ASM-038).
 *
 * The mirror is intentionally created per consumer rather than provided
 * globally:
 *   - The underlying writer carries per-instance mutexes and conflict-suffix
 *     memoisation (SPEC-ASM-001 §6.7). Sharing across consumers via
 *     `provide`/`inject` is a future optimisation; in v1 the panel is mounted
 *     in a single view so a fresh writer per mount is correct.
 *   - Construction is cheap: no I/O, just a writer + facade.
 *
 * Returns a small accessor object so callers can fire-and-forget
 * `mirrorTurn` from `ChatSidebar.handleSend` without awaiting the underlying
 * vault writes (REQ-ASM-040).
 *
 * Pure UI-layer composable: imports only narrow ports + the application-layer
 * mirror facade. The writer class is imported solely for construction; UI
 * callers receive a `SessionLogMirror` only (WP-5 DoD).
 */
import {
	createSessionLogMirror,
	type SessionLogMirror,
} from '@/application/chat/SessionLogMirror'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'

export interface UseSessionLogMirror {
	/**
	 * Returns the lazily-constructed {@link SessionLogMirror}. The mirror is
	 * cached on first call; subsequent calls return the same instance so the
	 * per-log-file mutex map (in the underlying writer) serialises correctly
	 * (REQ-ASM-040).
	 */
	getMirror(): Promise<SessionLogMirror>
}

export function useSessionLogMirror(): UseSessionLogMirror {
	const vault = useVaultPort()
	const logger = useLoggerPort()
	const settings = useSettingsPort()
	let cached: SessionLogMirror | null = null
	let cachedSpecsFolder: string | null = null
	// Shared in-flight initialization promise (Codex P1, PR #350). Without
	// this, two concurrent callers each `await settings.getSettings()` before
	// reading `cached`; both can observe `cached === null` and construct
	// different writers. Because the per-log-file mutex lives on each writer
	// instance, the two writers do not coordinate locks and can interleave
	// read/append/write cycles on the same log, dropping entries. Gating the
	// construction path behind a single Promise ensures every concurrent
	// caller gets the same mirror.
	let inFlight: Promise<SessionLogMirror> | null = null

	return {
		getMirror(): Promise<SessionLogMirror> {
			if (inFlight !== null) return inFlight
			const pending = (async (): Promise<SessionLogMirror> => {
				const current = await settings.getSettings()
				// Invalidate the cached mirror when the configured specs folder
				// has changed mid-session (Codex P2, PR #350). Without this, a
				// user who changes the Specs folder in settings keeps writing
				// session logs to the old folder while stage/context resolution
				// uses the new one, splitting history across roots.
				if (cached === null || cachedSpecsFolder !== current.specsFolder) {
					cached = createSessionLogMirror(
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
			// `specsFolder` change can be re-detected on the next call.
			// `.finally` preserves both resolution value and rejection, and
			// avoids a raw try/finally block (`no-restricted-syntax` rule).
			inFlight = pending.finally(() => {
				inFlight = null
			})
			return inFlight
		},
	}
}
