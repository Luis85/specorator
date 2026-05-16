/**
 * Pure search helpers for the `@`-file mention picker (PR-ASV-4 /
 * IDEA-ASV-001 D-ASV-3). Inspired by Claudian's `VaultMentionDataProvider`
 * but scoped to vault *files and folders* (PR-ASV-4-folders extension —
 * folders surface alongside files but never become context chips; see
 * `specs/agent-sidepanel-v2/research.md` D-ASV-3).
 *
 * Application-layer only — depends on `VaultPort` and primitive types. No
 * Vue, no Obsidian imports.
 */
import type { VaultPort } from '@/domain/ports'

/**
 * Hard cap on returned candidates. Matches the per-PR cap in the research
 * notes ("Cap results to 50 entries"). Higher caps quickly drown the
 * dropdown UI; 50 is the practical floor.
 */
export const MENTION_RESULT_CAP = 50

/**
 * Discriminator for a candidate. Files commit as `@<name> ` and emit
 * `add-context-file`; folders commit as `@<name>/` and do NOT emit (the
 * user is meant to keep typing to narrow into a child). PR-ASV-4-folders.
 */
export type MentionCandidateKind = 'file' | 'folder'

/**
 * A single search candidate. `path` is vault-relative (e.g.
 * `specs/foo/idea.md` for a file, `specs/foo` for a folder); `name` is
 * the basename ("idea.md" / "foo"). `kind` discriminates files from
 * folders so the dropdown / commit handlers can branch.
 */
export interface MentionCandidate {
	readonly path: string
	readonly name: string
	readonly mtime?: number
	readonly kind: 'file' | 'folder'
}

/**
 * Pre-computed search row. `pathLower` / `nameLower` cache the lowercase
 * forms so the per-keystroke `matchAndRank` loop avoids repeated
 * `.toLowerCase()` allocations. `kind` rides along so the ranking
 * comparator can break ties with files before folders.
 */
export interface RankedCandidate {
	readonly path: string
	readonly name: string
	readonly pathLower: string
	readonly nameLower: string
	readonly kind: MentionCandidateKind
}

/**
 * Recursively collect every file under `root` via `VaultPort`. Uses the
 * non-recursive `listFiles` + `listFolders` primitives so it works against
 * all three bridges without extending the port surface.
 *
 * The empty-string root listing the entire vault is intentional — it
 * matches Claudian's `MentionDataProvider.scanVault('')` and the brief
 * (`VaultPort.listFiles('')`). Tests inject smaller MockBridge
 * fixtures.
 */
export async function collectVaultFiles(vault: VaultPort, root = ''): Promise<string[]> {
	const [files, subfolders] = await Promise.all([
		vault.listFiles(root),
		vault.listFolders(root),
	])
	const nested = await Promise.all(
		subfolders.map((sub) => collectVaultFiles(vault, joinPath(root, sub))),
	)
	return [...files, ...nested.flat()]
}

/**
 * Recursively collect every folder under `root` via `VaultPort`. Mirror of
 * {@link collectVaultFiles} but emits folder paths (the parent path joined
 * with the child folder name) rather than file paths. PR-ASV-4-folders.
 *
 * The root itself is intentionally NOT included — only its descendants —
 * matching the dropdown's mental model that `@` opens a picker for the
 * vault's *contents*.
 */
export async function collectVaultFolders(
	vault: VaultPort,
	root = '',
): Promise<readonly string[]> {
	const subfolders = await vault.listFolders(root)
	const direct = subfolders.map((sub) => joinPath(root, sub))
	const nested = await Promise.all(
		subfolders.map((sub) => collectVaultFolders(vault, joinPath(root, sub))),
	)
	return [...direct, ...nested.flat()]
}

/**
 * Vault-path join that tolerates an empty parent (top-level scan).
 */
function joinPath(parent: string, child: string): string {
	const p = parent.replace(/\/+$/, '')
	return p ? `${p}/${child}` : child
}

/**
 * Extract the basename ("foo.md") from a vault-relative path. Pure helper
 * so callers can keep paths normalised on the way in.
 */
export function basenameOf(path: string): string {
	const idx = path.lastIndexOf('/')
	return idx === -1 ? path : path.slice(idx + 1)
}

/**
 * Pre-compute the lowercase search keys for every candidate.
 *
 * Accepts either a plain string-array of file paths (legacy call sites
 * pre-PR-ASV-4-folders) or a structured `{ files, folders }` shape so
 * folders can ride along with the `kind: 'folder'` tag. The legacy
 * string-array form defaults to `kind: 'file'` for every entry.
 *
 * Done once per dropdown open (the composable invalidates the cache on
 * each `@` trigger open), not on every keystroke.
 */
export function prepareCandidates(
	input: readonly string[] | { files: readonly string[]; folders: readonly string[] },
): RankedCandidate[] {
	const out: RankedCandidate[] = []
	const { files, folders } = isStructuredInput(input)
		? input
		: { files: input, folders: [] as readonly string[] }
	for (const path of files) out.push(makeRanked(path, 'file'))
	for (const path of folders) out.push(makeRanked(path, 'folder'))
	return out
}

function isStructuredInput(
	value: readonly string[] | { files: readonly string[]; folders: readonly string[] },
): value is { files: readonly string[]; folders: readonly string[] } {
	return !Array.isArray(value)
}

function makeRanked(path: string, kind: MentionCandidateKind): RankedCandidate {
	const name = basenameOf(path)
	return {
		path,
		name,
		pathLower: path.toLowerCase(),
		nameLower: name.toLowerCase(),
		kind,
	}
}

/**
 * Substring-match a candidate set against a query, sort by
 * 1) filename prefix-match wins (true > false),
 * 2) files before folders on tie,
 * 3) path lexicographic ascending,
 * and cap at {@link MENTION_RESULT_CAP}.
 *
 * Empty query short-circuits to the lexicographically-first
 * {@link MENTION_RESULT_CAP} candidates so the dropdown is never empty
 * immediately after a bare `@` keystroke.
 */
export function matchAndRank(
	candidates: readonly RankedCandidate[],
	query: string,
): MentionCandidate[] {
	const q = query.toLowerCase()
	const matches: RankedCandidate[] = []
	if (q === '') {
		matches.push(...candidates)
	} else {
		for (const c of candidates) {
			if (c.nameLower.includes(q) || c.pathLower.includes(q)) {
				matches.push(c)
			}
		}
	}
	matches.sort((a, b) => {
		const aPrefix = q !== '' && a.nameLower.startsWith(q)
		const bPrefix = q !== '' && b.nameLower.startsWith(q)
		if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
		// PR-ASV-4-folders: files outrank folders on tie. A file and a
		// folder with the same basename (e.g. `notes.md` next to
		// `notes/`) keeps the file at the top of the dropdown.
		if (a.kind !== b.kind) return a.kind === 'file' ? -1 : 1
		if (a.pathLower < b.pathLower) return -1
		if (a.pathLower > b.pathLower) return 1
		return 0
	})
	const limited = matches.slice(0, MENTION_RESULT_CAP)
	return limited.map(({ path, name, kind }) => ({ path, name, kind }))
}
