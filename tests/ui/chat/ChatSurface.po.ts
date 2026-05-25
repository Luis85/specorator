import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `ChatSurface.vue` (SPEC-CC-018). Queries by `data-testid` only (ADR-009). */
export class ChatSurfacePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="chat-surface"]').exists();
	}

	providerAttr(): string | undefined {
		return this.wrapper.get('[data-testid="chat-surface"]').attributes('data-provider');
	}

	showsWelcome(): boolean {
		return this.wrapper.find('[data-testid="chat-welcome"]').exists();
	}

	showsMessageList(): boolean {
		return this.wrapper.find('[data-testid="message-list"]').exists();
	}

	showsBusy(): boolean {
		return this.wrapper.find('[data-testid="chat-busy"]').exists();
	}

	showsUsage(): boolean {
		return this.wrapper.find('[data-testid="usage-info"]').exists();
	}

	usageText(): string {
		return this.wrapper.get('[data-testid="usage-info"]').text();
	}

	busyAriaLive(): string | undefined {
		return this.wrapper.get('[data-testid="chat-busy"]').attributes('aria-live');
	}

	assistantText(): string {
		return this.wrapper.get('[data-testid="message-assistant"]').text();
	}

	hasInterruptedBadge(): boolean {
		return this.wrapper.find('[data-testid="message-interrupted"]').exists();
	}

	sendDisabled(): boolean {
		return (this.wrapper.get('[data-testid="composer-send"]').element as HTMLButtonElement)
			.disabled;
	}

	async typeAndSend(text: string): Promise<void> {
		const textarea = this.wrapper.get('[data-testid="composer-textarea"]');
		await textarea.setValue(text);
		await this.wrapper.get('[data-testid="composer-send"]').trigger('click');
	}

	async clickStop(): Promise<void> {
		await this.wrapper.get('[data-testid="composer-send"]').trigger('click');
	}

	// ── P3 per-tab + compact (SPEC-TS-026) ──────────────────────────────────────

	hasTabBar(): boolean {
		return this.wrapper.find('[data-testid="tab-bar"]').exists();
	}

	tabBadgeCount(): number {
		return this.wrapper.findAll('[data-testid="tab-badge"]').length;
	}

	async clickNewTab(): Promise<void> {
		await this.wrapper.get('[data-testid="tab-new"]').trigger('click');
	}

	hasCompact(): boolean {
		return this.wrapper.find('[data-testid="chat-compact"]').exists();
	}

	async clickCompact(): Promise<void> {
		await this.wrapper.get('[data-testid="chat-compact"]').trigger('click');
	}
}
