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
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import { useSessionLogMirror } from '@/ui/composables/useSessionLogMirror'
import {
	VAULT_PORT,
	LOGGER_PORT,
	SETTINGS_PORT,
} from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

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
