/**
 * QW-B / QW-C — Compose a `<vault-context>` block prepended to the stage-aware
 * `systemPromptSuffix` so the agent (typically the Claude CLI subprocess) knows
 * where in the user's vault the conversation is anchored.
 *
 * Together with QW-A (vault-root `cwd`) the subprocess can resolve "this note"
 * / "the selection" / "this vault" without the user spelling them out.
 *
 * Rows, in emission order when present:
 *   - `Vault: <name> (<n> notes)` — QW-C, emitted only on the first turn of a
 *     new thread. Pluralisation: `1 note` vs `<n> notes` (zero is `0 notes`).
 *   - `Active note: <path>` — QW-B
 *   - `Selection:` + fenced code — QW-B; fence auto-grows to four backticks
 *     when the selection itself contains a triple-backtick sequence so the
 *     user's code does not break out of the wrapper.
 *
 * Block is suppressed entirely (returns `''`) when all three signals are
 * absent. A non-null `vaultGreeting` alone is enough to emit the block —
 * surfacing the greeting on the first turn is useful even when no file is
 * open.
 *
 * Pure function — no I/O, no port dependencies.
 *
 * Backwards-compat: the legacy positional `(activePath, selection)` signature
 * still works (no greeting); callers passing the new object form opt into the
 * QW-C greeting row.
 */
export interface VaultContextBlockArgs {
	readonly activeFilePath: string | null;
	readonly activeSelection: string | null;
	/**
	 * Vault metadata emitted as the top row on the first turn of a thread,
	 * `null` on follow-up turns (or whenever the caller has no greeting to
	 * emit). The caller decides "first turn" — the composer is pure.
	 */
	readonly vaultGreeting: { vaultName: string; markdownFileCount: number } | null;
}

function normaliseArgs(
	argOrPath: VaultContextBlockArgs | string | null,
	maybeSelection: string | null | undefined,
): VaultContextBlockArgs {
	if (argOrPath !== null && typeof argOrPath === 'object') {
		return argOrPath;
	}
	return {
		activeFilePath: argOrPath,
		activeSelection: maybeSelection ?? null,
		vaultGreeting: null,
	};
}

export function composeVaultContextBlock(args: VaultContextBlockArgs): string;
export function composeVaultContextBlock(
	activePath: string | null,
	selection: string | null,
): string;
export function composeVaultContextBlock(
	argOrPath: VaultContextBlockArgs | string | null,
	maybeSelection?: string | null,
): string {
	const { activeFilePath, activeSelection, vaultGreeting } = normaliseArgs(
		argOrPath,
		maybeSelection,
	);
	if (activeFilePath === null && activeSelection === null && vaultGreeting === null) {
		return '';
	}
	const lines: string[] = ['<vault-context>'];
	if (vaultGreeting !== null) {
		const noun = vaultGreeting.markdownFileCount === 1 ? 'note' : 'notes';
		lines.push(
			`Vault: ${vaultGreeting.vaultName} (${vaultGreeting.markdownFileCount} ${noun})`,
		);
	}
	if (activeFilePath !== null) {
		lines.push(`Active note: ${activeFilePath}`);
	}
	if (activeSelection !== null) {
		const fence = activeSelection.includes('```') ? '````' : '```';
		lines.push('Selection:', fence, activeSelection, fence);
	}
	lines.push('</vault-context>');
	return lines.join('\n');
}
