import type { ToolDiffData, DiffLine, DiffStats } from '@/domain/chat/diff/Diff';

/**
 * Word-level diff between `original` and `edited` (SPEC-CA-011, ADR-CA-004 §3).
 * Tokenises both with `split(/(\s+)/)` (words + whitespace runs kept as tokens,
 * parity Claudian `InlineEditModal.ts:171`) and computes the LCS over the token
 * arrays (classic DP table) so word boundaries survive. Returns a single-row
 * `ToolDiffData` whose `diffLines` are word-granular `equal`/`insert`/`delete`
 * ops the UNCHANGED P2 `DiffView` renders (SPEC-CA-024) — `text` is the token.
 *
 * Pure + total (NFR-CA-011): identical inputs → an all-`equal` no-op
 * (`stats {added:0, removed:0}`, EC-CA-10); empty inputs → an empty diff; never
 * throws. `filePath` is `''` (inline edit has no tool file). No new runtime
 * dependency (in-repo DP/LCS). No `obsidian`/`node:*`/Vue import.
 */
export function computeWordDiff(original: string, edited: string): ToolDiffData {
	const diffLines = backtrace(tokenise(original), tokenise(edited));
	return { filePath: '', diffLines, stats: countChanges(diffLines) };
}

/**
 * Split a string into word + whitespace-run tokens (parity Claudian). An empty
 * string yields zero tokens (not `['']`) so a one-sided empty input is a clean
 * all-insert / all-delete with no phantom `''` op.
 */
function tokenise(text: string): string[] {
	return text === '' ? [] : text.split(/(\s+)/);
}

/** Classic LCS DP table over the two token arrays. */
function lcsTable(oldTokens: readonly string[], newTokens: readonly string[]): number[][] {
	const m = oldTokens.length;
	const n = newTokens.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				oldTokens[i - 1] === newTokens[j - 1]
					? dp[i - 1][j - 1] + 1
					: Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}
	return dp;
}

/** Walk the LCS back-trace into a token-granular DiffLine[] (one entry per token). */
function backtrace(oldTokens: readonly string[], newTokens: readonly string[]): DiffLine[] {
	const dp = lcsTable(oldTokens, newTokens);
	const reversed: DiffLine[] = [];
	let i = oldTokens.length;
	let j = newTokens.length;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
			reversed.push({ type: 'equal', text: oldTokens[i - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			reversed.push({ type: 'insert', text: newTokens[j - 1] });
			j--;
		} else {
			reversed.push({ type: 'delete', text: oldTokens[i - 1] });
			i--;
		}
	}
	reversed.reverse();
	return reversed;
}

/** Count inserted/deleted word tokens (whitespace-only and empty tokens excluded). */
function countChanges(lines: readonly DiffLine[]): DiffStats {
	let added = 0;
	let removed = 0;
	for (const line of lines) {
		if (line.text.trim() === '') continue;
		if (line.type === 'insert') added++;
		else if (line.type === 'delete') removed++;
	}
	return { added, removed };
}
