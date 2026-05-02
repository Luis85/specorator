export interface PluginSettings {
	readonly locale: string
	readonly specsFolder: string
	readonly archiveFolder: string
	readonly decisionsFolder: string
	readonly constitutionFile: string
	readonly gateStrictness: 'strict' | 'lenient'
	readonly teamMode: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	specsFolder: 'specs',
	archiveFolder: 'archive',
	decisionsFolder: 'decisions',
	constitutionFile: 'CONSTITUTION.md',
	gateStrictness: 'strict',
	teamMode: false,
}

/**
 * Abstracts all Obsidian API calls so the UI and domain logic
 * remain testable without an Obsidian instance.
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
