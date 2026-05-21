import type { VueWrapper } from '@vue/test-utils'

/**
 * PageObject for CursorKeyField.vue (REQ-MPS-011, REQ-MPS-012).
 * Queries elements exclusively by `data-testid` (ADR-009).
 */
export class CursorKeyFieldPO {
  constructor(private readonly wrapper: VueWrapper) {}

  get input() {
    return this.wrapper.find('[data-testid="settings-cursor-key-input"]')
  }

  get description() {
    return this.wrapper.find('[data-testid="settings-cursor-key-description"]')
  }

  get status() {
    return this.wrapper.find('[data-testid="settings-cursor-key-status"]')
  }

  get unavailableNotice() {
    return this.wrapper.find('[data-testid="settings-cursor-key-unavailable-notice"]')
  }

  inputValue(): string {
    return (this.input.element as HTMLInputElement).value
  }

  async setInput(value: string): Promise<void> {
    const el = this.input.element as HTMLInputElement
    el.value = value
    await this.input.trigger('input')
  }

  async blurInput(): Promise<void> {
    await this.input.trigger('blur')
  }
}
