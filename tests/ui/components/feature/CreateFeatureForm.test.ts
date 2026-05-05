import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/ui/i18n'
import CreateFeatureForm from '@/ui/components/feature/CreateFeatureForm.vue'
import { NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { CreateFeatureFormPageObject } from './CreateFeatureForm.po'

function mountForm(
	submitHandler: (payload: { title: string; area?: string }) => Promise<boolean>,
) {
	const notify = {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	}
	const wrapper = mount(CreateFeatureForm, {
		props: { submitHandler },
		global: {
			provide: { [NOTIFICATION_PORT as symbol]: notify },
			plugins: [i18n],
		},
	})
	return new CreateFeatureFormPageObject(wrapper)
}

describe('CreateFeatureForm', () => {
	it('clears inputs after a successful submit', async () => {
		const handler = vi.fn().mockResolvedValue(true)
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await flushPromises()

		expect(handler).toHaveBeenCalledWith({ title: 'My Feature', area: undefined })
		expect(po.titleValue).toBe('')
	})

	it('retains inputs after a failed submit', async () => {
		const handler = vi.fn().mockResolvedValue(false)
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await flushPromises()

		expect(po.titleValue).toBe('My Feature')
	})

	it('ignores re-entrant submits while a submit is in flight', async () => {
		let resolve!: (v: boolean) => void
		const handler = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await po.submit()
		resolve(true)
		await flushPromises()

		expect(handler).toHaveBeenCalledTimes(1)
	})

	it('emits cancel when the cancel button is clicked', async () => {
		const po = mountForm(vi.fn())
		await po.clickCancel()
		expect(po.emitted('cancel')).toBeTruthy()
	})

	it('handleSubmit: calls notify.showError instead of throwing when submitHandler rejects', async () => {
		const notify = {
			showError: vi.fn(),
			showWarning: vi.fn(),
			showSuccess: vi.fn(),
			showInfo: vi.fn(),
		}
		const wrapper = mount(CreateFeatureForm, {
			props: {
				submitHandler: () => Promise.reject(new Error('slug conflict')),
			},
			global: {
				provide: { [NOTIFICATION_PORT as symbol]: notify },
				plugins: [i18n],
			},
		})
		const po = new CreateFeatureFormPageObject(wrapper)
		await po.setTitle('My Feature')
		await po.submit()
		await flushPromises()
		expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('slug conflict'))
	})
})
