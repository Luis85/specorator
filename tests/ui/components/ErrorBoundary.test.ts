import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import type { LoggerPort, NotificationPort } from '@/domain/ports'
import { ErrorBoundaryPO } from './ErrorBoundary.po'

function makeFakeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
function makeFakeNotify(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }
}

const ThrowingChild = defineComponent({
	setup() {
		throw new Error('child exploded')
	},
	render() {
		return h('div')
	},
})

const HappyChild = defineComponent({
	template: '<span data-testid="happy-child">ok</span>',
})

async function mountBoundary(
	child: ReturnType<typeof defineComponent>,
	logger = makeFakeLogger(),
	notify = makeFakeNotify(),
) {
	const wrapper = mount(ErrorBoundary, {
		slots: { default: child },
		global: {
			provide: {
				[LOGGER_PORT as symbol]: logger,
				[NOTIFICATION_PORT as symbol]: notify,
			},
		},
	})
	await flushPromises()
	return { wrapper, po: new ErrorBoundaryPO(wrapper), logger, notify }
}

describe('ErrorBoundary', () => {
	it('renders slot content when no error', async () => {
		const { po, wrapper } = await mountBoundary(HappyChild)
		expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(true)
		expect(po.hasFallback()).toBe(false)
	})

	it('renders fallback when child throws', async () => {
		const { po } = await mountBoundary(ThrowingChild)
		expect(po.hasFallback()).toBe(true)
	})

	it('calls logger.error when child throws', async () => {
		const { logger } = await mountBoundary(ThrowingChild)
		expect(logger.error).toHaveBeenCalledWith(
			'[ErrorBoundary] Unhandled component error',
			expect.any(Error),
		)
	})

	it('calls notify.showError when child throws', async () => {
		const { notify } = await mountBoundary(ThrowingChild)
		expect(notify.showError).toHaveBeenCalledWith(
			'Something went wrong. Please reload the view.',
		)
	})

	it('hides slot when fallback is shown', async () => {
		const { wrapper } = await mountBoundary(ThrowingChild)
		expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(false)
	})
})
