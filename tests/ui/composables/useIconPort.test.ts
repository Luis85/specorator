/**
 * REQ-AUX-001 — `useIconPort` resolves the injected IconPort and throws a
 * spec-mandated error when the port has not been provided.
 */
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useIconPort } from '@/ui/composables/useIconPort'
import { ICON_PORT } from '@/infrastructure/bridge/ports'
import type { IconPort } from '@/domain/ports'

describe('useIconPort', () => {
	it('returns the provided port via inject', () => {
		const port: IconPort = { setIcon: vi.fn() }
		let resolved: IconPort | null = null
		const Consumer = defineComponent({
			setup() {
				resolved = useIconPort()
				return () => h('div')
			},
		})
		mount(Consumer, {
			global: { provide: { [ICON_PORT as symbol]: port } },
		})
		expect(resolved).toBe(port)
	})

	it('throws a clear error when no IconPort has been provided', () => {
		const Consumer = defineComponent({
			setup() {
				useIconPort()
				return () => h('div')
			},
		})
		expect(() => mount(Consumer)).toThrow(/IconPort was not provided/)
	})
})
