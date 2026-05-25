import type {
	VaultPort,
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
} from '@/domain/ports';

/**
 * Obsidian `ProviderCommandCatalogPort` (SPEC-CP-007/013, coverage-excluded —
 * manual leg TEST-CP-M1). The Claude file-backed catalog: commands from
 * `<vault>/.claude/commands/**` /*.md, skills from `<vault>/.claude/skills/**` /
 * SKILL.md, read through `VaultPort.listFiles`/`listFolders` (mirrors
 * `providers/claude/{commands,storage}/*`). Each file maps to a `CatalogEntry`
 * (`builtIn: false`, `prefix` `/` for commands / `$` for skills). An absent
 * `.claude` folder -> `[]` (load-or-default, REQ-CP-004). All I/O via `VaultPort`.
 */
const COMMANDS_PATH = '.claude/commands';
const SKILLS_PATH = '.claude/skills';

export class ObsidianProviderCommandCatalog implements ProviderCommandCatalogPort {
	constructor(private readonly vault: VaultPort) {}

	async getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]> {
		return kind === 'command' ? this._commands() : this._skills();
	}

	/** `.claude/commands/**` /*.md -> `command` entries (`/` prefix). */
	private async _commands(): Promise<CatalogEntry[]> {
		const files = await this._listMarkdownRecursive(COMMANDS_PATH);
		return files.map((path) => ({
			kind: 'command' as const,
			prefix: '/' as const,
			name: this._relativeName(path, COMMANDS_PATH),
			builtIn: false,
		}));
	}

	/** `.claude/skills/<name>/SKILL.md` -> `skill` entries (`$` prefix). */
	private async _skills(): Promise<CatalogEntry[]> {
		const folders = await this._safeListFolders(SKILLS_PATH);
		const entries: CatalogEntry[] = [];
		for (const folder of folders) {
			const skillName = folder;
			const skillPath = `${SKILLS_PATH}/${skillName}/SKILL.md`;
			if (await this._safeExists(skillPath)) {
				entries.push({ kind: 'skill', prefix: '$', name: skillName, builtIn: false });
			}
		}
		return entries;
	}

	/** Recursively collect `*.md` files under `root` via VaultPort (no obsidian API). */
	private async _listMarkdownRecursive(root: string): Promise<string[]> {
		const out: string[] = [];
		const stack = [root];
		while (stack.length > 0) {
			const dir = stack.pop();
			if (dir === undefined) continue;
			for (const file of await this._safeListFiles(dir)) {
				if (file.endsWith('.md')) out.push(file);
			}
			for (const sub of await this._safeListFolders(dir)) {
				stack.push(`${dir}/${sub}`);
			}
		}
		return out;
	}

	/** The name relative to `root`, sans `.md` (mirrors SlashCommandStorage.filePathToName). */
	private _relativeName(path: string, root: string): string {
		return path.replace(`${root}/`, '').replace(/\.md$/, '');
	}

	private async _safeListFiles(dir: string): Promise<string[]> {
		try {
			return await this.vault.listFiles(dir);
		} catch {
			return [];
		}
	}

	private async _safeListFolders(dir: string): Promise<string[]> {
		try {
			return await this.vault.listFolders(dir);
		} catch {
			return [];
		}
	}

	private async _safeExists(path: string): Promise<boolean> {
		try {
			return await this.vault.fileExists(path);
		} catch {
			return false;
		}
	}
}
