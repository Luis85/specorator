import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/ui/i18n'
import CreateFeatureForm from '../CreateFeatureForm.vue'

function mountForm(submitHandler: (payload: { title: string; area?: string }) => Promise<boolean>) {
  return mount(CreateFeatureForm, {
    props: { submitHandler },
    global: { plugins: [i18n] },
  })
}

describe('CreateFeatureForm', () => {
  it('clears inputs after a successful submit', async () => {
    const handler = vi.fn().mockResolvedValue(true)
    const wrapper = mountForm(handler)

    await wrapper.find('#feature-title').setValue('My Feature')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(handler).toHaveBeenCalledWith({ title: 'My Feature', area: undefined })
    expect((wrapper.find('#feature-title').element as HTMLInputElement).value).toBe('')
  })

  it('retains inputs after a failed submit', async () => {
    const handler = vi.fn().mockResolvedValue(false)
    const wrapper = mountForm(handler)

    await wrapper.find('#feature-title').setValue('My Feature')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((wrapper.find('#feature-title').element as HTMLInputElement).value).toBe('My Feature')
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mountForm(vi.fn())

    const buttons = wrapper.findAll('button')
    const cancelButton = buttons.find((b) => b.attributes('type') === 'button')
    await cancelButton!.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
