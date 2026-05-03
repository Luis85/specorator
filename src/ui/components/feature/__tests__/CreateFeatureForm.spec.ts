import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/ui/i18n'
import CreateFeatureForm from '../CreateFeatureForm.vue'

function mountForm(options: Parameters<typeof mount<typeof CreateFeatureForm>>[1] = {}) {
  return mount(CreateFeatureForm, {
    ...options,
    global: {
      plugins: [i18n],
      ...options.global,
    },
  })
}

describe('CreateFeatureForm', () => {
  it('clears inputs after a successful submit', async () => {
    const submitHandler = vi.fn().mockResolvedValue(true)
    const wrapper = mountForm({ props: { submitHandler } })

    await wrapper.find('#feature-title').setValue(' Search ')
    await wrapper.find('#feature-area').setValue(' SR ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(submitHandler).toHaveBeenCalledWith({ title: 'Search', area: 'SR' })
    expect((wrapper.find('#feature-title').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#feature-area').element as HTMLInputElement).value).toBe('')
  })

  it('retains inputs and shows an inline error after a failed submit', async () => {
    const submitHandler = vi.fn().mockResolvedValue(false)
    const wrapper = mountForm({ props: { submitHandler } })

    await wrapper.find('#feature-title').setValue(' Search ')
    await wrapper.find('#feature-area').setValue(' SR ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper.setProps({ errorMessage: 'Feature already exists.' })

    expect(submitHandler).toHaveBeenCalledWith({ title: 'Search', area: 'SR' })
    expect((wrapper.find('#feature-title').element as HTMLInputElement).value).toBe(' Search ')
    expect((wrapper.find('#feature-area').element as HTMLInputElement).value).toBe(' SR ')
    expect(wrapper.find('[role="alert"]').text()).toBe('Feature already exists.')
  })
})
