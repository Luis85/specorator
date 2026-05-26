import { Modal, Setting, type App } from 'obsidian';
import type { NotificationPort } from '@/domain/ports/NotificationPort';
import type { TranslationPort } from '@/domain/ports/TranslationPort';
import type { ProviderRegistryPort } from '@/domain/ports/ProviderRegistryPort';
import type { EnvSnippetService } from '@/application/settings/EnvSnippetService';
import type { SnippetEditLauncher } from '@/plugin/settings';
import {
	serializeEnvEntries,
	type EnvironmentScope,
	type EnvSnippetStruct,
} from '@/domain/chat/environment/EnvSnippet';

/**
 * The env-snippet create/edit + delete-confirm Obsidian `Modal`s (P10, SPEC-SS-011).
 * The settings tab drives these through the `SnippetEditLauncher` seam so the
 * `obsidian`-importing `Modal` hosts stay in `src/plugin/**` (the tab never imports a
 * modal directly). DOM is built with the `Setting` API / `createEl` / `setText` — NO
 * `innerHTML`/`v-html`; the delete confirmation is a `Modal`, NEVER `window.confirm`
 * (SPEC-SS-023, REQ-SS-095). Each Obsidian `Modal` traps + restores focus by the host
 * convention (SPEC-SS-024, REQ-SS-072). Coverage-excluded `src/plugin/**` → manual leg
 * TEST-SS-M1. No `obsidian` symbol leaks past `src/plugin/**`.
 */

interface SnippetModalDeps {
	readonly app: App;
	readonly service: EnvSnippetService;
	readonly registry: ProviderRegistryPort;
	readonly notify: NotificationPort;
	readonly t: TranslationPort['t'];
}

/** The mutable fields the snippet editor collects (the env text holds plaintext; the service splits secrets). */
interface SnippetFormState {
	name: string;
	description: string;
	envText: string;
	scope: EnvironmentScope | undefined;
}

/** The `SnippetEditLauncher` the settings tab consumes (SPEC-SS-011). */
export function createSnippetEditLauncher(deps: SnippetModalDeps): SnippetEditLauncher {
	return {
		openCreate: () => new EnvSnippetEditModal(deps, undefined).openAndWait(),
		openEdit: (snippet) => new EnvSnippetEditModal(deps, snippet).openAndWait(),
		openDelete: (snippet) => new EnvSnippetDeleteModal(deps, snippet).openAndWait(),
	};
}

/** The scope options offered by the editor's scope dropdown (shared + every registered provider). */
function scopeOptions(deps: SnippetModalDeps): readonly { value: string; scope: EnvironmentScope | undefined }[] {
	const options: { value: string; scope: EnvironmentScope | undefined }[] = [
		{ value: '', scope: undefined },
		{ value: 'shared', scope: 'shared' },
	];
	for (const descriptor of deps.registry.listRegisteredProviders()) {
		options.push({ value: `provider:${descriptor.id}`, scope: `provider:${descriptor.id}` });
	}
	return options;
}

/** The create/edit snippet editor. Save → `create`/`edit`; an empty name blocks persist. */
class EnvSnippetEditModal extends Modal {
	private resolved = false;
	private resolve: ((saved: boolean) => void) | null = null;
	private readonly state: SnippetFormState;

	constructor(
		private readonly deps: SnippetModalDeps,
		private readonly snippet: EnvSnippetStruct | undefined,
	) {
		super(deps.app);
		this.state = {
			name: snippet?.name ?? '',
			description: snippet?.description ?? '',
			envText: snippet !== undefined ? serializeEnvEntries(snippet.envEntries) : '',
			scope: snippet?.scope,
		};
	}

	openAndWait(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		const { contentEl } = this;
		const t = this.deps.t;
		this.titleEl.setText(
			t(this.snippet === undefined ? 'settings.envSnippets.modal.createTitle' : 'settings.envSnippets.modal.editTitle'),
		);

		new Setting(contentEl).setName(t('settings.envSnippets.modal.nameLabel')).addText((text) =>
			text.setValue(this.state.name).onChange((value) => {
				this.state.name = value;
			}),
		);
		new Setting(contentEl)
			.setName(t('settings.envSnippets.modal.descriptionLabel'))
			.addText((text) =>
				text.setValue(this.state.description).onChange((value) => {
					this.state.description = value;
				}),
			);
		new Setting(contentEl)
			.setName(t('settings.envSnippets.modal.envLabel'))
			.addTextArea((area) =>
				area
					.setPlaceholder(t('settings.envSnippets.modal.envPlaceholder'))
					.setValue(this.state.envText)
					.onChange((value) => {
						this.state.envText = value;
					}),
			);
		new Setting(contentEl).setName(t('settings.envSnippets.modal.scopeLabel')).addDropdown((dropdown) => {
			for (const option of scopeOptions(this.deps)) {
				const label =
					option.value === ''
						? '—'
						: option.value === 'shared'
							? t('settings.envSnippets.modal.scopeShared')
							: option.value;
				dropdown.addOption(option.value, label);
			}
			dropdown.setValue(this.state.scope ?? '').onChange((value) => {
				this.state.scope = value === '' ? undefined : (value as EnvironmentScope);
			});
		});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(t('settings.envSnippets.modal.save'))
					.setCta()
					.onClick(() => {
						void this.save();
					}),
			)
			.addButton((button) =>
				button.setButtonText(t('settings.envSnippets.modal.cancel')).onClick(() => {
					this.close();
				}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.settle(false);
	}

	/** Persist via `create`/`edit`; an empty name keeps the modal open with the `nameRequired` notice. */
	private async save(): Promise<void> {
		if (this.state.name.trim() === '') {
			this.deps.notify.showWarning(this.deps.t('settings.envSnippets.nameRequired'));
			return;
		}
		const input = {
			name: this.state.name,
			description: this.state.description,
			envText: this.state.envText,
			...(this.state.scope !== undefined ? { scope: this.state.scope } : {}),
		};
		const result =
			this.snippet === undefined
				? await this.deps.service.create(input)
				: await this.deps.service.edit(this.snippet.id, input);
		if (!result.ok) {
			this.deps.notify.showError(this.deps.t('settings.envSnippets.saveFailed'));
			return;
		}
		this.settle(true);
		this.close();
	}

	private settle(saved: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(saved);
	}
}

/** The delete-confirm modal (NEVER `window.confirm`). Confirm → `EnvSnippetService.remove`. */
class EnvSnippetDeleteModal extends Modal {
	private resolved = false;
	private resolve: ((removed: boolean) => void) | null = null;

	constructor(
		private readonly deps: SnippetModalDeps,
		private readonly snippet: EnvSnippetStruct,
	) {
		super(deps.app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		const { contentEl } = this;
		const t = this.deps.t;
		this.titleEl.setText(t('settings.envSnippets.delete', { name: this.snippet.name }));
		contentEl.createEl('p', { text: t('settings.envSnippets.deleteConfirm') });
		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(t('settings.envSnippets.delete', { name: this.snippet.name }))
					.setWarning()
					.onClick(() => {
						void this.confirm();
					}),
			)
			.addButton((button) =>
				button.setButtonText(t('settings.envSnippets.modal.cancel')).onClick(() => {
					this.close();
				}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.settle(false);
	}

	private async confirm(): Promise<void> {
		const result = await this.deps.service.remove(this.snippet.id);
		if (!result.ok) {
			this.deps.notify.showError(this.deps.t('settings.envSnippets.removeFailed'));
			return;
		}
		this.settle(true);
		this.close();
	}

	private settle(removed: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(removed);
	}
}
