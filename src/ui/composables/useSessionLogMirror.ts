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
import { getCurrentInstance, onBeforeUnmount } from 'vue'
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

/**
 * Module-level registry of live mirrors owned by `useSessionLogMirror`
 * consumers. Populated when the composable lazily constructs a mirror,
 * cleared when the host component's `onBeforeUnmount` fires (Codex P2 round-2,
 * PR #406).
 *
 * The plugin teardown path (`SpecoratorPlugin.onunload`) consults
 * {@link flushAllActiveSessionLogMirrors} below to drain any pending
 * debounced frontmatter flush before Obsidian tears the plugin down. The
 * composable's own `onBeforeUnmount` catches the sidebar-close path, but the
 * app-exit / plugin-disable path can run **before** Vue's unmount completes
 * — the registry gives `onunload` a single synchronous handle on the live
 * writers without coupling the plugin layer to Vue's component lifecycle.
 *
 * The set is module-scoped because all instances of `useSessionLogMirror`
 * within a single Obsidian session share the same module load and the
 * plugin layer has no other handle into the composable's closure. A
 * `WeakRef`/`FinalizationRegistry` variant was considered and rejected:
 * finalizer timing is non-deterministic across runtimes, and the explicit
 * deregister-on-unmount path is straightforward and predictable.
 */
const activeMirrors = new Set<SessionLogMirror>()

/**
 * Drain every live `SessionLogMirror` registered by an in-flight
 * `useSessionLogMirror` consumer. Called from `SpecoratorPlugin.onunload()`
 * so the last few turns' `updated:` timestamps land on disk before the
 * plugin / Obsidian tears down. Safe to call when the set is empty (no-op).
 *
 * Each mirror's `flushAll()` is independent — failures on one path are
 * already routed to `logger.error` inside the writer, so we use
 * `Promise.allSettled` to make sure a single failing path cannot strand
 * the others.
 */
export function flushAllActiveSessionLogMirrors(): Promise<void> {
	if (activeMirrors.size === 0) return Promise.resolve()
	const drains = Array.from(activeMirrors, (mirror) => mirror.flushAll())
	return Promise.allSettled(drains).then(() => undefined)
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

	// Codex P2 round-2 (PR #406): drain the debounced frontmatter flush on
	// component teardown. The underlying `SessionLogWriter` debounces the
	// `updated:` frontmatter rewrite for up to 30 s after every turn append
	// (the body itself lands on disk synchronously via `appendFile`). If the
	// sidebar unmounts inside that window, the in-memory `pendingFields`
	// snapshot is dropped and the next session load shows the new turn body
	// against a stale `updated:` timestamp.
	//
	// Registering `onBeforeUnmount` here is safe because `useSessionLogMirror`
	// is consumed exactly once per `ChatSidebar` mount (no `provide`/`inject`
	// fan-out, no aggregate composable). The cached mirror lives in this
	// closure and is not shared with any other consumer, so draining on the
	// only consumer's unmount cannot strand another caller's pending work.
	//
	// `onBeforeUnmount`'s callback executes synchronously inside Vue's
	// teardown phase; it cannot `await`. We fire-and-forget the async
	// `flushAll()` via `void` — the underlying writer drains through its
	// per-path mutex, which is independent of the Vue lifecycle, so the
	// final write proceeds on the microtask queue even though the
	// component has already detached. Errors are swallowed: by the time we
	// hit teardown the panel is gone, so there is no UI surface for a
	// notification and the writer already routes failures to
	// `logger.error` internally.
	//
	// `getCurrentInstance()` returns null in the standalone browser harness
	// when the composable is called outside `setup()` (e.g. test scaffolding
	// that constructs the composable in a `beforeEach` without a host
	// component). Guard the hook so calling sites without a component
	// instance still work.
	if (getCurrentInstance() !== null) {
		onBeforeUnmount(() => {
			if (cached === null) return
			// Drop the registry entry first so the plugin's onunload drain
			// does not double-flush a mirror that this hook is already
			// retiring. The drain itself is fire-and-forget for the same
			// reasons documented above — the composable cannot await inside
			// Vue's synchronous teardown phase.
			activeMirrors.delete(cached)
			void cached.flushAll()
		})
	}

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
					// Retire the previous mirror's registry entry before
					// replacing it so the plugin-level drain does not call
					// `flushAll()` on a writer the composable has already
					// abandoned. The new mirror's `flushAll()` covers the
					// pending state of the path under the new specsFolder.
					//
					// Codex P2 round-3 (PR #406): drain the retiring mirror
					// **before** removing it from `activeMirrors`. The
					// underlying `SessionLogWriter` debounces the `updated:`
					// frontmatter rewrite for up to 30 s after every turn
					// append; without an explicit drain here, M1 keeps its
					// pending flush but is no longer reachable from
					// `flushAllActiveSessionLogMirrors()` — if the plugin
					// tears down inside the debounce window, the latest
					// frontmatter update for the old path is dropped.
					//
					// Fire-and-forget mirrors the `onBeforeUnmount` shape
					// below: this call site is inside the synchronous
					// `inFlight` Promise constructor and cannot `await`
					// without serialising every subsequent `getMirror()`
					// caller behind the old debounce window. The writer's
					// per-path mutex + bounded re-drain loop completes the
					// work on microtasks regardless.
					//
					// Order matters: drain THEN deregister. The drain is
					// async and the deregistration is synchronous, so there
					// is a microtask window where both this branch and
					// `flushAllActiveSessionLogMirrors()` can see the
					// mirror. That overlap is fine because `flushAll()` is
					// idempotent — the writer's bounded re-drain loop folds
					// any concurrent invocations into a single per-path
					// flush.
					if (cached !== null) {
						void cached.flushAll()
						activeMirrors.delete(cached)
					}
					cached = createSessionLogMirror(
						vault,
						logger,
						current.specsFolder,
						() => new Date().toISOString(),
					)
					cachedSpecsFolder = current.specsFolder
					activeMirrors.add(cached)
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
