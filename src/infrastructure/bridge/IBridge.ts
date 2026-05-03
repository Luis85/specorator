import type { PluginSettings } from '@/domain/settings/PluginSettings'

export { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

/**
 * Abstracts all Obsidian API calls so the UI and domain logic
 * remain testable without an Obsidian instance.
 *
 * @deprecated Use the narrow ports in @/domain/ports instead. This
 * interface is removed in Task 16.
 */
export interface IBridge {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	deleteFile(path: string): Promise<void>
	listFiles(folder: string): Promise<string[]>
	listFolders(parent: string): Promise<string[]>
	fileExists(path: string): Promise<boolean>
	createFolder(path: string): Promise<void>
	openFile(path: string): Promise<void>
	showNotice(message: string, durationMs?: number): void
	getSettings(): Promise<PluginSettings>
	saveSettings(settings: PluginSettings): Promise<void>
}
