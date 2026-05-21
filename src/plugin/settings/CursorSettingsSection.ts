/**
 * T-MPS-050 — Cursor settings section.
 *
 * Renders the Cursor API key field, the `cursorApiPreview` toggle, and the
 * `autoPreferProvider` dropdown inside `SpecoratorSettingTab`. Mirrors the
 * Obsidian-native `Setting` shape used by `renderAnthropicKeyField` —
 * the plugin tab is **not** a Vue surface; the matching `CursorKeyField.vue`
 * exists for storybook + standalone-UI parity and the dedicated unit tests.
 *
 * Satisfies REQ-MPS-008 (autoPreferProvider), REQ-MPS-011 (Cursor key field),
 * REQ-MPS-012 (degraded notice), REQ-MPS-014 (cursorApiPreview toggle),
 * NFR-MPS-001 (key never written to PluginSettings).
 */
import { Setting } from 'obsidian'
import type { SecretStorePort } from '@/domain/ports'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { tryAsync } from '@/domain/shared/tryAsync'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { ProviderId } from '@/domain/chat/ProviderSelection'

/**
 * Snapshot of what `renderCursorSettingsSection` needs from the host
 * plugin. Kept narrow on purpose so the section is unit-testable without
 * a real `SpecoratorPlugin` instance.
 */
export interface CursorSettingsSectionDeps {
	readonly containerEl: HTMLElement
	readonly secretStore: SecretStorePort | null
	readonly settings: PluginSettings
	/** Current cached Cursor key value (used to pre-populate the password input). */
	readonly cursorKeyCache: string
	updateSettings(patch: Partial<PluginSettings>): Promise<void>
	/** Refresh the host plugin's Cursor-key cache after a successful save. */
	refreshCursorKeyCache(): Promise<void>
	/** Bump every open view so adapters re-evaluate availability. */
	bumpAllViews(): void
}

export function renderCursorSettingsSection(deps: CursorSettingsSectionDeps): void {
	const { containerEl } = deps
	new Setting(containerEl).setName('Cursor').setHeading()

	renderCursorKeyField(deps)
	renderCursorApiPreviewToggle(deps)
	renderAutoPreferProviderDropdown(deps)
}

function renderCursorKeyField(deps: CursorSettingsSectionDeps): void {
	const writable = deps.secretStore?.available ?? false
	const desc = writable
		? "Required to use the Cursor provider. Stored in this device's OS keychain (not synced)."
		: 'This Obsidian build does not expose the OS keychain, so the Cursor key cannot be stored on this device. Use the Cursor command-line provider instead.'

	new Setting(deps.containerEl)
		.setName('Cursor API key')
		.setDesc(desc)
		.addText((text) => {
			text.inputEl.type = 'password'
			text.inputEl.autocomplete = 'off'
			text.inputEl.setAttribute('data-testid', 'settings-cursor-key')
			if (!writable) {
				text.inputEl.disabled = true
			}
			text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('cursor-…')
				.setValue(deps.cursorKeyCache)
				.onChange(async (value) => {
					const store = deps.secretStore
					if (store === null) return
					if (!store.available) return
					// Persist via the OS keychain. If the underlying call throws
					// (locked keychain, OS denial) the input retains the user's
					// typed value but the cache is not refreshed — matching the
					// Anthropic-key field semantics.
					const outcome = await tryAsync(() =>
						store.setSecret(SECRET_ID_CURSOR, value.trim()),
					)
					if (!outcome.ok) return
					await deps.refreshCursorKeyCache()
					deps.bumpAllViews()
				})
		})
}

function renderCursorApiPreviewToggle(deps: CursorSettingsSectionDeps): void {
	new Setting(deps.containerEl)
		.setName('Preview: Cursor API')
		.setDesc(
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			'Enable the Cursor HTTP API provider. Off by default while the upstream API surface is being finalised.',
		)
		.addToggle((toggle) => {
			toggle.toggleEl.setAttribute('data-testid', 'settings-cursor-api-preview')
			toggle.setValue(deps.settings.cursorApiPreview).onChange(async (value) => {
				await deps.updateSettings({ cursorApiPreview: value })
				deps.bumpAllViews()
			})
		})
}

function renderAutoPreferProviderDropdown(deps: CursorSettingsSectionDeps): void {
	new Setting(deps.containerEl)
		.setName('Auto-select provider')
		.setDesc(
			'When both providers are available and the selector is set to auto, prefer this provider.',
		)
		.addDropdown((dd) => {
			dd.selectEl.setAttribute('data-testid', 'settings-auto-prefer-provider')
			dd.addOption('claude', 'Claude')
			dd.addOption('cursor', 'Cursor')
			dd.setValue(deps.settings.autoPreferProvider).onChange(async (value) => {
				const next = value as ProviderId
				await deps.updateSettings({ autoPreferProvider: next })
				deps.bumpAllViews()
			})
		})
}
