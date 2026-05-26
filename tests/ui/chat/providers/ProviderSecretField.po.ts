import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'provider-secret-field',
	input: 'provider-secret-input',
	save: 'provider-secret-save',
	unavailable: 'provider-secret-unavailable',
} as const;

/** PageObject for `ProviderSecretField.vue` (SPEC-PV-018). Queries by `data-testid` only (ADR-009). */
export class ProviderSecretFieldPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	inputExists(): boolean {
		return this.wrapper.find(this.byTid(TID.input)).exists();
	}

	inputType(): string {
		return this.wrapper.get(this.byTid(TID.input)).attributes('type') ?? '';
	}

	inputDisabled(): boolean {
		return this.wrapper.get(this.byTid(TID.input)).attributes('disabled') !== undefined;
	}

	inputAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.input)).attributes('aria-label') ?? '';
	}

	/** The DOM `value` attribute on the rendered input (must never echo the typed secret). */
	inputValueAttr(): string {
		return this.wrapper.get(this.byTid(TID.input)).attributes('value') ?? '';
	}

	unavailableShown(): boolean {
		return this.wrapper.find(this.byTid(TID.unavailable)).exists();
	}

	unavailableText(): string {
		return this.wrapper.get(this.byTid(TID.unavailable)).text();
	}

	saveDisabled(): boolean {
		return this.wrapper.get(this.byTid(TID.save)).attributes('disabled') !== undefined;
	}

	rootHtml(): string {
		return this.wrapper.get(this.byTid(TID.root)).html();
	}

	async type(value: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.input)).setValue(value);
	}

	async clickSave(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.save)).trigger('click');
	}

	async submit(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('submit');
	}
}
