import type {
	VaultPort,
	MentionDataProviderPort,
	MentionReferent,
	MentionReferentKind,
} from '@/domain/ports';

/**
 * Obsidian `MentionDataProviderPort` (SPEC-CP-007, coverage-excluded — manual leg
 * TEST-CP-M1). An application-layer COMPOSITE over (i) a vault source on the
 * existing `VaultPort` (`listFiles`/`listFolders` -> file/folder referents — the
 * UI never imports obsidian, REQ-CP-010) and (ii) a Claude catalog source for
 * subagent referents from `<vault>/.claude/agents`. The MCP-server source no-ops
 * `[]` in P4 (P8/NG4); subagent is wired Claude-only (NG5); an empty/absent source
 * does NOT error the palette (REQ-CP-012). Filtering + the cap live here; the
 * debounce + request-guard live in the consumer (SPEC-CP-018).
 *
 * All I/O is through `VaultPort` (no direct `obsidian` API). Coverage-excluded
 * infra; its behavioural gate is the manual leg against a real vault.
 */
const MENTION_CAP = 50;
const AGENTS_PATH = '.claude/agents';

export class ObsidianMentionDataProvider implements MentionDataProviderPort {
	constructor(private readonly vault: VaultPort) {}

	async query(filter: string, signal?: AbortSignal): Promise<MentionReferent[]> {
		const [files, folders, subagents] = await Promise.all([
			this._vaultFiles(),
			this._vaultFolders(),
			this._claudeSubagents(),
		]);
		if (signal?.aborted === true) return [];
		// MCP-server + external-dir sources are no-op [] in P4 (P8/NG4).
		const all = [...files, ...folders, ...subagents];
		return this._filter(all, filter);
	}

	/** Vault root files -> `file` referents. Load-or-default `[]` on any read fault. */
	private async _vaultFiles(): Promise<MentionReferent[]> {
		try {
			const paths = await this.vault.listFiles('');
			return paths.map((path) => this._toReferent('file', basename(path), path, path));
		} catch {
			return [];
		}
	}

	/** Vault root folders -> `folder` referents. Load-or-default `[]`. */
	private async _vaultFolders(): Promise<MentionReferent[]> {
		try {
			const names = await this.vault.listFolders('');
			return names.map((name) => this._toReferent('folder', name, `${name}/`, name));
		} catch {
			return [];
		}
	}

	/** Claude subagents under `.claude/agents` -> `subagent` referents (Claude-only, NG5). */
	private async _claudeSubagents(): Promise<MentionReferent[]> {
		try {
			const files = await this.vault.listFiles(AGENTS_PATH);
			return files
				.filter((path) => path.endsWith('.md'))
				.map((path) => {
					const name = basename(path).replace(/\.md$/, '');
					return this._toReferent('subagent', name, `@${name}`, 'Subagent');
				});
		} catch {
			// Absent `.claude/agents` folder — an empty source does not error (REQ-CP-012).
			return [];
		}
	}

	private _toReferent(
		kind: MentionReferentKind,
		name: string,
		mentionText: string,
		detail: string,
	): MentionReferent {
		return { kind, name, mentionText: kind === 'subagent' ? mentionText : `@${mentionText}`, detail };
	}

	private _filter(all: MentionReferent[], filter: string): MentionReferent[] {
		const needle = filter.trim().toLowerCase();
		const matched =
			needle === ''
				? all
				: all.filter((r) => `${r.name}${r.detail ?? ''}`.toLowerCase().includes(needle));
		return matched.slice(0, MENTION_CAP);
	}
}

/** Last path segment (vault paths use `/`). */
function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? path : path.slice(i + 1);
}
