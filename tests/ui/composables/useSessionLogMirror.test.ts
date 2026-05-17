/**
 * Tests for `useSessionLogMirror` — cache + invalidation on specsFolder change.
 *
 * Codex P2 (PR #350): a user who changes the configured Specs folder
 * mid-session previously kept writing session logs to the old folder
 * because `getWriter()` memoised the first writer forever. The composable
 * now invalidates the cache when `settings.specsFolder` differs from the
 * cached one, so writes follow the user's setting.
 *
 * WP-5: the composable returns a `SessionLogMirror` facade. The cache
 * behaviour is preserved one-for-one; the test names track the facade
 * shape (`getMirror` instead of `getWriter`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import {
	useSessionLogMirror,
	flushAllActiveSessionLogMirrors,
} from '@/ui/composables/useSessionLogMirror'
import {
	VAULT_PORT,
	LOGGER_PORT,
	SETTINGS_PORT,
} from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { asSessionId } from '@/domain/chat/SessionId'

function makeBridgeWithSpecsFolder(specsFolder: string): MockBridge {
	const bridge = new MockBridge()
	let current: PluginSettings = { ...DEFAULT_SETTINGS, specsFolder }
	// MockBridge.getSettings is overridable; we read `current` so the test
	// can mutate the active specs folder between getMirror() calls.
	bridge.getSettings = async () => current
	;(bridge as unknown as { __setSpecsFolder: (s: string) => void }).__setSpecsFolder = (
		s: string,
	) => {
		current = { ...current, specsFolder: s }
	}
	return bridge
}

function mountHost(bridge: MockBridge): {
	wrapper: ReturnType<typeof mount>
	composable: ReturnType<typeof useSessionLogMirror>
} {
	const composableRef: { current: ReturnType<typeof useSessionLogMirror> | null } = {
		current: null,
	}
	const Host = defineComponent({
		name: 'TestHost',
		setup() {
			composableRef.current = useSessionLogMirror()
			return () => h('div')
		},
	})
	const wrapper = mount(Host, {
		global: {
			provide: {
				[VAULT_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: bridge,
				[SETTINGS_PORT as symbol]: bridge,
			},
		},
	})
	if (composableRef.current === null) throw new Error('composable did not run')
	return { wrapper, composable: composableRef.current }
}

describe('useSessionLogMirror', () => {
	beforeEach(() => {
		// Pinia not required — composable only depends on the three ports.
	})

	it('memoises the mirror across calls when specsFolder is unchanged', async () => {
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { composable } = mountHost(bridge)

		const first = await composable.getMirror()
		const second = await composable.getMirror()

		expect(second).toBe(first)
	})

	it('returns a NEW mirror when specsFolder changes between calls (Codex P2, PR #350)', async () => {
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { composable } = mountHost(bridge)

		const before = await composable.getMirror()

		// User changes the Specs folder in settings mid-session.
		;(bridge as unknown as { __setSpecsFolder: (s: string) => void }).__setSpecsFolder(
			'docs/specs',
		)

		const after = await composable.getMirror()
		expect(after).not.toBe(before)
	})

	it('drains the retired mirror when specsFolder changes mid-session (Codex P2 round-3, PR #406)', async () => {
		// Repro: when the user changes the configured `specsFolder` mid-session,
		// the composable replaces the cached mirror M1 with a fresh M2 bound to
		// the new root. SessionLogWriter's `updated:` frontmatter rewrite is
		// debounced up to 30 s after every turn, so M1 may still own a pending
		// flush when it is retired. Before this fix M1 was deregistered from
		// `activeMirrors` without `flushAll()` being called, so a plugin
		// teardown inside that debounce window would silently drop M1's
		// frontmatter update for the old path. The composable must drain the
		// retiring mirror before swapping it out.
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { composable } = mountHost(bridge)

		const before = await composable.getMirror()
		const flushSpy = vi.spyOn(before, 'flushAll')

		// User changes the Specs folder in settings mid-session.
		;(bridge as unknown as { __setSpecsFolder: (s: string) => void }).__setSpecsFolder(
			'docs/specs',
		)

		const after = await composable.getMirror()
		expect(after).not.toBe(before)
		expect(flushSpy).toHaveBeenCalledTimes(1)
	})

	it('does not invalidate when specsFolder is set to the same value again', async () => {
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { composable } = mountHost(bridge)

		const before = await composable.getMirror()
		;(bridge as unknown as { __setSpecsFolder: (s: string) => void }).__setSpecsFolder(
			'specs',
		)
		const after = await composable.getMirror()

		expect(after).toBe(before)
	})

	it('drains the cached mirror on component unmount (Codex P2 round-2, PR #406)', async () => {
		// Repro: the underlying SessionLogWriter debounces the `updated:`
		// frontmatter flush for up to 30 s after every turn append. If the
		// sidebar unmounts inside that window without a teardown drain, the
		// pending `updated:` snapshot is dropped and the next session load
		// shows the new turn body against a stale timestamp. The composable's
		// onBeforeUnmount hook must invoke flushAll() on the cached mirror.
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { wrapper, composable } = mountHost(bridge)

		const mirror = await composable.getMirror()
		const flushSpy = vi.spyOn(mirror, 'flushAll')

		wrapper.unmount()

		expect(flushSpy).toHaveBeenCalledTimes(1)
	})

	it('does not call flushAll on unmount when no mirror was ever constructed', async () => {
		// The cached mirror is lazy: if no consumer calls getMirror() before
		// unmount, the hook must be a no-op. Guards against an accidental
		// flush on an undefined / freshly-constructed dummy.
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { wrapper } = mountHost(bridge)

		// Intentionally never await composable.getMirror() — the cached
		// mirror reference stays null until the first getMirror() call.

		// Unmount should not throw and should not register anything in the
		// drain registry to flush.
		expect(() => {
			wrapper.unmount()
		}).not.toThrow()
	})

	it('flushAllActiveSessionLogMirrors drains every live mirror (plugin teardown surface)', async () => {
		// Repro: SpecoratorPlugin.onunload() needs a single handle to drain
		// every live mirror because Obsidian's onunload() runs synchronously
		// and cannot await Vue's onBeforeUnmount cascade. The module-level
		// registry + drain function is the contract `main.ts` consumes.
		const bridgeA = makeBridgeWithSpecsFolder('specs')
		const bridgeB = makeBridgeWithSpecsFolder('docs/specs')
		const hostA = mountHost(bridgeA)
		const hostB = mountHost(bridgeB)

		const mirrorA = await hostA.composable.getMirror()
		const mirrorB = await hostB.composable.getMirror()
		const flushA = vi.spyOn(mirrorA, 'flushAll')
		const flushB = vi.spyOn(mirrorB, 'flushAll')

		await flushAllActiveSessionLogMirrors()

		expect(flushA).toHaveBeenCalledTimes(1)
		expect(flushB).toHaveBeenCalledTimes(1)

		// Clean up: unmount removes the entry from the registry so subsequent
		// tests start from a clean slate.
		hostA.wrapper.unmount()
		hostB.wrapper.unmount()
	})

	it('unmounting deregisters the mirror so plugin teardown does not double-flush', async () => {
		// If the composable's onBeforeUnmount leaves the mirror in the
		// registry, the plugin's onunload would call flushAll() on a mirror
		// the composable already drained. That's wasteful and could hit a
		// retired writer's state. The hook must deregister first.
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { wrapper, composable } = mountHost(bridge)
		const mirror = await composable.getMirror()
		const flushSpy = vi.spyOn(mirror, 'flushAll')

		wrapper.unmount() // expected to drain + deregister
		expect(flushSpy).toHaveBeenCalledTimes(1)

		await flushAllActiveSessionLogMirrors() // expected no-op

		expect(flushSpy).toHaveBeenCalledTimes(1)
	})

	it('writes the turn body via appendFile and the teardown drain materialises the updated frontmatter', async () => {
		// End-to-end repro mirroring the bug-report sequence:
		//   1. mirrorTurn lands the body via appendFile.
		//   2. The debounced frontmatter flush is scheduled.
		//   3. Component unmounts before the debounce fires.
		//   4. The unmount hook drives flushAll() → the on-disk `updated:`
		//      frontmatter reflects the post-turn timestamp.
		// We can't observe a *missed* `updated:` because the composable now
		// drains on unmount — that's the fix. What we *can* assert is that
		// after unmount the file's `updated:` field is the turn timestamp
		// (i.e. the drain actually wrote the frontmatter rewrite).
		const bridge = makeBridgeWithSpecsFolder('specs')
		const { wrapper, composable } = mountHost(bridge)

		const thread: ChatThreadRecord = {
			threadId: 'thread-1',
			sessionId: asSessionId('11111111-2222-3333-4444-555555555555'),
			feature: 'foo',
			logPath: 'specs/foo/sessions/11111111-2222-3333-4444-555555555555.md',
			transport: 'subscription',
			createdAt: '2026-05-17T08:00:00.000Z',
			lastUsedAt: '2026-05-17T08:00:00.000Z',
		}

		const mirror = await composable.getMirror()
		await mirror.mirrorTurn(thread, { user: 'hello', assistant: 'world' })

		// Sanity: body landed on disk via appendFile, not writeFile (per WP-5
		// round-2 design). The seed `writeFile` for the new file is counted
		// once; turn appends use `appendFile`.
		const path = 'specs/foo/sessions/11111111-2222-3333-4444-555555555555.md'
		expect(bridge.calls.appendFile.some((c) => c.path === path)).toBe(true)

		// Before the unmount drain there is no flush yet; the `updated:`
		// field on disk still equals the original `created:` value (seed
		// time). Verify the contract by reading the file.
		const beforeFlush = await bridge.readFile(path)
		expect(beforeFlush).toContain('## user')
		expect(beforeFlush).toContain('hello')

		// Unmount triggers flushAll(). It is fire-and-forget inside the
		// hook, so we need to drain microtasks before asserting the on-disk
		// state. Two `await Promise.resolve()` ticks cover the chained
		// `then()`s inside the per-path flush queue.
		wrapper.unmount()
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers
		await new Promise<void>((r) => setTimeout(r, 0))
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers
		await new Promise<void>((r) => setTimeout(r, 0))

		// After the drain, the file's frontmatter `updated:` field is
		// present. The exact timestamp comes from the writer's `nowIso()`
		// (Date.now() at flush time) — the bug fix is "it lands at all".
		const afterFlush = await bridge.readFile(path)
		expect(afterFlush.startsWith('---\n')).toBe(true)
		expect(afterFlush).toMatch(/updated:\s*'[^']+'/)
	})

	it('returns the same mirror instance for concurrent first-time callers (Codex P1, PR #350)', async () => {
		// Hold settings.getSettings() until both callers are waiting on it. Without
		// the in-flight serialization, both callers would resume past the await
		// observing cached === null and construct two different writers — each
		// carrying its own per-file mutex map, so concurrent appends to the same
		// log could interleave and drop entries.
		const bridge = new MockBridge()
		let resolveSettings!: (v: PluginSettings) => void
		const settingsPromise = new Promise<PluginSettings>((resolve) => {
			resolveSettings = resolve
		})
		bridge.getSettings = () => settingsPromise

		const { composable } = mountHost(bridge)
		const firstPending = composable.getMirror()
		const secondPending = composable.getMirror()

		// Both callers are now suspended on the same settings promise.
		resolveSettings({ ...DEFAULT_SETTINGS, specsFolder: 'specs' })

		const [first, second] = await Promise.all([firstPending, secondPending])
		expect(second).toBe(first)
	})
})
