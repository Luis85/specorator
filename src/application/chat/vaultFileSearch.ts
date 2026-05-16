/**
 * Pure search helpers for the `@`-file mention picker (PR-ASV-4 /
 * IDEA-ASV-001 D-ASV-3). Inspired by Claudian's `VaultMentionDataProvider`
 * but scoped to vault *files* only (no folders, no agents, no MCP, no
 * external dirs — see `specs/agent-sidepanel-v2/research.md` D-ASV-3).
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
 * A single search candidate. `path` is vault-relative (e.g.
 * `specs/foo/idea.md`); `name` is the basename ("idea.md").
 */
export interface MentionCandidate {
	readonly path: string
	readonly name: string
}

/**
 * Pre-computed search row. `pathLower` / `nameLower` cache the lowercase
 * forms so the per-keystroke `matchAndRank` loop avoids repeated
 * `.toLowerCase()` allocations.
 */
export interface RankedCandidate {
	readonly path: string
	readonly name: string
	readonly pathLower: string
	readonly nameLower: string
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
 * Pre-compute the lowercase search keys for every candidate. Done once per
 * dropdown open (the composable invalidates the cache on each `@` trigger
 * open), not on every keystroke.
 */
export function prepareCandidates(paths: readonly string[]): RankedCandidate[] {
	const out: RankedCandidate[] = []
	for (const path of paths) {
		const name = basenameOf(path)
		out.push({
			path,
			name,
			pathLower: path.toLowerCase(),
			nameLower: name.toLowerCase(),
		})
	}
	return out
}

/**
 * Substring-match a candidate set against a query, sort by
 * 1) filename prefix-match wins (true > false),
 * 2) path lexicographic ascending,
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
		if (a.pathLower < b.pathLower) return -1
		if (a.pathLower > b.pathLower) return 1
		return 0
	})
	const limited = matches.slice(0, MENTION_RESULT_CAP)
	return limited.map(({ path, name }) => ({ path, name }))
}
