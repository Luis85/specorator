import type { VueWrapper } from '@vue/test-utils'

/**
 * PageObject for ClaudeCliPathField.vue (REQ-ASM-004, REQ-ASM-005, REQ-ASM-008).
 * Queries elements exclusively by `data-testid` (ADR-009).
 */
export class ClaudeCliPathFieldPO {
  constructor(private readonly wrapper: VueWrapper) {}

  get input() {
    return this.wrapper.find('[data-testid="settings-claude-cli-path-input"]')
  }

  get autodetectBtn() {
    return this.wrapper.find('[data-testid="settings-claude-cli-path-autodetect"]')
  }

  get testBtn() {
    return this.wrapper.find('[data-testid="settings-claude-cli-path-test"]')
  }

  get description() {
    return this.wrapper.find('[data-testid="settings-claude-cli-path-description"]')
  }

  get status() {
    return this.wrapper.find('[data-testid="settings-claude-cli-path-status"]')
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

  async clickAutodetect(): Promise<void> {
    await this.autodetectBtn.trigger('click')
  }

  async clickTest(): Promise<void> {
    await this.testBtn.trigger('click')
  }
}
