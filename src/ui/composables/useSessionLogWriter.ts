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

	return {
		async getWriter(): Promise<SessionLogWriter> {
			if (cached !== null) return cached
			const current = await settings.getSettings()
			cached = new SessionLogWriter(
				vault,
				logger,
				current.specsFolder,
				() => new Date().toISOString(),
			)
			return cached
		},
	}
}
